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

PYTHON_VERSION="3.12.1"
PYTHON_DIR="$INSTALL_DIR/python"
# Using python-build-standalone for a portable build
PYTHON_URL="https://github.com/indygreg/python-build-standalone/releases/download/20240107/cpython-3.12.1+20240107-x86_64-unknown-linux-gnu-install_only.tar.gz"

echo ">>> Starting Cloud Hub Installation..."

# 0. Dependencies
echo ">>> Checking dependencies..."
# Install essential build and utility tools
DEPS="git rsync curl tar xz-utils ca-certificates"
echo ">>> Installing dependencies: $DEPS..."
apt-get update
apt-get install -y $DEPS

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
rsync -av --delete --exclude='node_modules' --exclude='dist' --exclude='.env' --exclude='.git' "$SOURCE_DIR/" "$BACKEND_DEST/"

# 5. Install Dependencies and Build
echo ">>> Installing dependencies..."
cd $BACKEND_DEST

# Setup Local Node.js
INSTALLED_NODE_VER=""
if [ -x "$NODE_DIR/bin/node" ]; then
    INSTALLED_NODE_VER=$("$NODE_DIR/bin/node" -v)
fi

if [ "$INSTALLED_NODE_VER" != "$NODE_VERSION" ]; then
    echo ">>> Installing Node.js $NODE_VERSION..."
    mkdir -p /tmp/cloud-hub-install
    cd /tmp/cloud-hub-install
    
    rm -f node-$NODE_VERSION-linux-x64.tar.xz
    curl -L -O --fail "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.xz"
    
    echo ">>> Extracting Node.js..."
    tar -xf node-$NODE_VERSION-linux-x64.tar.xz
    
    # Clean old version
    rm -rf $NODE_DIR
    
    # Move to install dir
    mv node-$NODE_VERSION-linux-x64 $NODE_DIR
    
    rm node-$NODE_VERSION-linux-x64.tar.xz
else
    echo ">>> Local Node.js $NODE_VERSION already installed at $NODE_DIR"
fi

# Setup Local Python 3.12
INSTALLED_PYTHON_VER=""
if [ -x "$PYTHON_DIR/bin/python3" ]; then
    INSTALLED_PYTHON_VER=$("$PYTHON_DIR/bin/python3" --version 2>&1 | awk '{print $2}')
    echo ">>> Detected installed Python version: $INSTALLED_PYTHON_VER"
else
    echo ">>> No Python detected at $PYTHON_DIR"
fi

# Force update if version mismatch or empty
if [ "$INSTALLED_PYTHON_VER" != "$PYTHON_VERSION" ]; then
    echo ">>> Installing Python $PYTHON_VERSION (Current: ${INSTALLED_PYTHON_VER:-None})..."
    mkdir -p /tmp/cloud-hub-install
    cd /tmp/cloud-hub-install
    
    # URL updated to follow redirects
    REAL_PYTHON_URL="https://github.com/astral-sh/python-build-standalone/releases/download/20240107/cpython-3.12.1+20240107-x86_64-unknown-linux-gnu-install_only.tar.gz"
    
    rm -f cpython-install.tar.gz
    echo ">>> Downloading Python distribution..."
    curl -L -o cpython-install.tar.gz --fail "$REAL_PYTHON_URL"
    
    echo ">>> Extracting Python..."
    # Clean possible residue
    rm -rf python
    
    # The tarball extracts to ./python for install_only builds
    # Use -z for verify gzip, though usually auto-detected
    tar -xf cpython-install.tar.gz
    
    if [ -d "python" ]; then
        echo ">>> Moving Python to $PYTHON_DIR..."
        rm -rf $PYTHON_DIR
        mv python $PYTHON_DIR
        
        # Verify installation
        if [ -x "$PYTHON_DIR/bin/python3" ]; then
            NEW_VER=$("$PYTHON_DIR/bin/python3" --version)
            echo ">>> Successfully installed $NEW_VER"
        else
            echo ">>> ERROR: Python binary not executable after install"
            ls -la $PYTHON_DIR/bin
            exit 1
        fi
    else
        echo ">>> ERROR: Python extraction failed. Directory 'python' not created."
        ls -la
        exit 1
    fi
    
    rm cpython-install.tar.gz
else
    echo ">>> Local Python $PYTHON_VERSION already installed at $PYTHON_DIR"
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

# Create Custom Services Directory
mkdir -p "$INSTALL_DIR/custom-services"
chown -R $USER:$USER "$INSTALL_DIR/custom-services"

# 5.1 Sudoers for Firewall & Services
echo ">>> Configuring sudo rights..."
SUDO_FILE="/etc/sudoers.d/cloud-hub-permissions"
if [ ! -f "$SUDO_FILE" ]; then
    # Firewall
    echo "$USER ALL=(root) NOPASSWD: /usr/sbin/iptables" > $SUDO_FILE
    echo "$USER ALL=(root) NOPASSWD: /sbin/iptables" >> $SUDO_FILE
    
    # Systemd Management (Restricted to custom-* services for safety if possible, but here we give broad access for management)
    # We allow managing any service, but ideally the app should only touch its own.
    echo "$USER ALL=(root) NOPASSWD: /bin/systemctl" >> $SUDO_FILE
    echo "$USER ALL=(root) NOPASSWD: /usr/bin/systemctl" >> $SUDO_FILE
    
    # Allow writing service files
    # We use 'tee' to write files as root
    echo "$USER ALL=(root) NOPASSWD: /usr/bin/tee /etc/systemd/system/*.service" >> $SUDO_FILE
    echo "$USER ALL=(root) NOPASSWD: /usr/bin/rm /etc/systemd/system/*.service" >> $SUDO_FILE
    
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

# Ensure Services Paths are in config (for updates)
if ! grep -q "SERVICES_NODE_PATH" $CONF_FILE; then
    echo "SERVICES_NODE_PATH=/opt/cloud-hub/node/bin/node" >> $CONF_FILE
fi
if ! grep -q "SERVICES_PYTHON_PATH" $CONF_FILE; then
    echo "SERVICES_PYTHON_PATH=/opt/cloud-hub/python/bin/python3" >> $CONF_FILE
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

