#!/bin/sh

set -eu

echo "--- Stopping Current North Star Server ---"
killall -9 daemon || true
killall -9 NorthStar || true

echo "--- Compiling Backend ---"
cd /root/app
cargo build --release

echo "--- Installing Backend ---"
rm -f /usr/local/bin/NorthStar
cp target/release/NorthStar /usr/local/bin/
chmod +x /usr/local/bin/NorthStar

echo "--- Installing Runtime Helper ---"
cp /root/app/run_northstar.sh /usr/local/bin/run_northstar.sh
chmod +x /usr/local/bin/run_northstar.sh

echo "--- Installing App Nginx Config ---"
cat > /usr/local/etc/nginx/nginx.conf <<'EOF'
worker_processes 1;

events {
    worker_connections 1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile      on;

    server {
        listen 80;
        server_name localhost;
        client_max_body_size 50M;

        # Serve the installed North Star web app.
        location / {
            root   /usr/local/www/northstar-ui;
            index  index.html index.htm;
            try_files $uri $uri/ /index.html;
        }

        # Pass companion API and live event traffic through to Rust.
        location /api/ {
            proxy_pass http://127.0.0.1:3100;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_buffering off;
            proxy_cache off;
        }
    }
}
EOF

echo "--- Ensuring State Directories ---"
mkdir -p /var/db/northstar/state
chown -R www:www /var/db/northstar

if [ ! -f "/usr/local/etc/northstar.env" ]; then
    echo "--- Installing Example Environment File ---"
    cp /root/app/northstar.env.example /usr/local/etc/northstar.env
fi

if [ -d "/root/app/dist" ]; then
    echo "--- Installing Frontend ---"
    rm -rf /usr/local/www/northstar-ui
    mkdir -p /usr/local/www/northstar-ui
    cp -r /root/app/dist/* /usr/local/www/northstar-ui/
    chown -R www:www /usr/local/www/northstar-ui
    chmod -R 755 /usr/local/www/northstar-ui
else
    echo "--- No 'dist' folder found. Keeping old website. ---"
fi

echo "--- Enabling And Reloading App Nginx ---"
sysrc nginx_enable=YES >/dev/null
if service nginx status >/dev/null 2>&1; then
    service nginx reload
else
    /usr/local/etc/rc.d/nginx onestart
fi

echo "--- Starting North Star ---"
/usr/sbin/daemon -f /usr/local/bin/run_northstar.sh

echo "--- Status Check ---"
sleep 2
sockstat -4 -l | grep 3100
fetch -qo - http://127.0.0.1:3100/api/health >/dev/null
fetch -qo - http://127.0.0.1/ >/dev/null

echo "--- NORTH STAR DEPLOY COMPLETE ---"
