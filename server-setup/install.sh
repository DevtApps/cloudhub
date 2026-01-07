#!/bin/bash

# Cloud Hub Installer
# Usage: curl -sL https://raw.githubusercontent.com/DevtApps/cloudhub/main/server-setup/install.sh | sudo bash

set -e

REPO_URL="https://github.com/DevtApps/cloudhub.git"
INSTALL_DIR="/opt/cloud-hub"
SOURCE_DIR="$INSTALL_DIR/source"
BACKEND_DEST="$INSTALL_DIR/backend"
CONF_DIR="/etc/cloudhub"
CONF_FILE="$CONF_DIR/hub.conf"
SERVICE_FILE="/etc/systemd/system/cloud-hub.service"
USER="cloud-hub"

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root"
  exit 1
fi

NODE_VERSION="v20.11.0"
NODE_DIR="$INSTALL_DIR/node"

echo ">>> Starting Cloud Hub Installation..."

# 0. Dependencies
echo ">>> Checking dependencies..."
if ! command -v git &> /dev/null; then
    echo ">>> Installing Git..."
    apt-get update && apt-get install -y git
fi

if ! command -v rsync &> /dev/null; then
    echo ">>> Installing rsync..."
    apt-get update && apt-get install -y rsync
fi

# Detect update mode
if systemctl is-active --quiet cloud-hub; then
    echo ">>> Detected running Cloud Hub service. Stopping for update..."
    systemctl stop cloud-hub
fi

# 1. Create User
if id "$USER" &>/dev/null; then
    echo ">>> User $USER already exists."
else
    echo ">>> Creating user $USER..."
    useradd -r -s /bin/false $USER
fi

# 2. Setup Directories
mkdir -p $INSTALL_DIR
mkdir -p $CONF_DIR
mkdir -p /var/log/cloud-hub
chown -R $USER:$USER /var/log/cloud-hub

# 3. Clone/Update Source
echo ">>> Fetching source code..."
if [ -d "$SOURCE_DIR/.git" ]; then
    echo ">>> Updating existing repository..."
    cd $SOURCE_DIR
    git pull
else
    echo ">>> Cloning repository..."
    rm -rf $SOURCE_DIR
    git clone $REPO_URL $SOURCE_DIR
fi

# 4. Deploy Backend
echo ">>> Deploying backend..."
# Sync files excluding heavy node_modules which we install fresh
rsync -av --delete --exclude='node_modules' --exclude='dist' --exclude='.env' "$SOURCE_DIR/backend/" "$BACKEND_DEST/"

# 5. Install Dependencies and Build
echo ">>> Installing dependencies..."
cd $BACKEND_DEST

# Setup Local Node.js
if [ ! -f "$NODE_DIR/bin/node" ]; then
    echo ">>> Downloading Node.js $NODE_VERSION..."
    cd /tmp
    curl -O https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.xz
    
    echo ">>> Extracting Node.js..."
    tar -xf node-$NODE_VERSION-linux-x64.tar.xz
    rm node-$NODE_VERSION-linux-x64.tar.xz
    
    # Move to install dir
    rm -rf $NODE_DIR
    mv node-$NODE_VERSION-linux-x64 $NODE_DIR
else
    echo ">>> Local Node.js found at $NODE_DIR"
fi

# Use local node for build
export PATH="$NODE_DIR/bin:$PATH"

# Check for pnpm
if ! command -v pnpm &> /dev/null; then
    echo ">>> Installing pnpm..."
    npm install -g pnpm
fi

echo ">>> Building application..."
cd $BACKEND_DEST
pnpm install
pnpm build

# Fix permissions
chown -R $USER:$USER $INSTALL_DIR

# 5.1 Sudoers for IPTables
echo ">>> Configuring sudo access for Firewall..."
SUDO_FILE="/etc/sudoers.d/cloud-hub-iptables"
if [ ! -f "$SUDO_FILE" ]; then
    echo "$USER ALL=(root) NOPASSWD: /usr/sbin/iptables" > $SUDO_FILE
    # Also allow standard binary locations just in case
    echo "$USER ALL=(root) NOPASSWD: /sbin/iptables" >> $SUDO_FILE
    chmod 0440 $SUDO_FILE
fi

# 6. Configuration
echo ">>> Setting up configuration..."
if [ ! -f "$CONF_FILE" ]; then
    cp "$SOURCE_DIR/server-setup/hub.conf" $CONF_FILE
    chown $USER:$USER $CONF_FILE
    chmod 600 $CONF_FILE
    echo ">>> Created default configuration at $CONF_FILE"
else
    echo ">>> Preserving existing configuration at $CONF_FILE"
fi

# 7. Systemd Service
echo ">>> Configuring systemd service..."
cp "$SOURCE_DIR/server-setup/cloud-hub.service" $SERVICE_FILE
systemctl daemon-reload

# 8. Start Service
echo ">>> Enabling and starting service..."
systemctl enable cloud-hub
systemctl restart cloud-hub

echo "-------------------------------------------------------"
echo ">>> Installation Complete!"
echo "    Config: $CONF_FILE"
echo "    Status: systemctl status cloud-hub"
echo "    Logs:   journalctl -u cloud-hub -f"
echo "-------------------------------------------------------"

