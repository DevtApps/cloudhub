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

echo ">>> Starting Cloud Hub Installation..."

# 0. Dependencies
if ! command -v git &> /dev/null; then
    echo ">>> Installing Git..."
    apt-get update && apt-get install -y git
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

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo ">>> Node.js not found. Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# Check for pnpm
if ! command -v pnpm &> /dev/null; then
    echo ">>> Installing pnpm..."
    npm install -g pnpm
fi

echo ">>> Building application..."
pnpm install
pnpm build

# Fix permissions
chown -R $USER:$USER $INSTALL_DIR

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

