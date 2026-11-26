import os
import sys
import time
import urllib.request
import paramiko
from scp import SCPClient

ROUTER_IP = "192.168.1.2"
ROUTER_USER = "root"
REMOTE_BASE = "/mnt/web_apps/smarthome-edge"
LOCAL_BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "prod", "relay-server"))

def main():
    if len(sys.argv) < 2:
        print("Usage: python deploy_router.py <root_password>")
        sys.exit(1)
        
    password = sys.argv[1]
    print(f">>> [1/6] Connecting to router {ROUTER_IP} via SSH...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(ROUTER_IP, username=ROUTER_USER, password=password, timeout=10)
    print(">>> SSH Connected successfully!")

    print(">>> [2/6] Stopping edge service...")
    stdin, stdout, stderr = ssh.exec_command("/etc/init.d/smarthome-edge stop; killall -9 smarthome-edge 2>/dev/null; sleep 1")
    stdout.channel.recv_exit_status()
    print(">>> Service stopped.")

    # Ensure remote dirs exist
    ssh.exec_command(f"mkdir -p {REMOTE_BASE}/bin {REMOTE_BASE}/config {REMOTE_BASE}/web {REMOTE_BASE}/data")

    with SCPClient(ssh.get_transport()) as scp:
        print(">>> [3/6] Uploading updated ARM64 binary...")
        bin_local = os.path.join(LOCAL_BASE, "bin", "smarthome-edge-linux-arm64")
        scp.put(bin_local, remote_path=f"{REMOTE_BASE}/bin/smarthome-edge")
        ssh.exec_command(f"chmod +x {REMOTE_BASE}/bin/smarthome-edge")
        print(">>> Binary uploaded and permissions set.")

        print(">>> [4/6] Uploading web assets...")
        web_local = os.path.join(LOCAL_BASE, "web")
        scp.put(web_local, recursive=True, remote_path=REMOTE_BASE)
        print(">>> Web assets uploaded.")

        print(">>> [5/6] Uploading OpenWrt configuration...")
        cfg_local = os.path.join(LOCAL_BASE, "config", "config.openwrt.json")
        scp.put(cfg_local, remote_path=f"{REMOTE_BASE}/config/config.json")
        ssh.exec_command(f"if [ -d /etc/smarthome-edge ]; then cp {REMOTE_BASE}/config/config.json /etc/smarthome-edge/config.json; fi")
        print(">>> Config uploaded.")

    print(">>> [6/6] Starting updated edge service...")
    stdin, stdout, stderr = ssh.exec_command("/etc/init.d/smarthome-edge start")
    stdout.channel.recv_exit_status()
    print(">>> Service start command issued.")

    print("Waiting 4 seconds for service initialization...")
    time.sleep(4)

    try:
        req = urllib.request.urlopen(f"http://{ROUTER_IP}:9200/api/v1/health", timeout=5)
        print(f">>> Health status ({req.getcode()}): {req.read().decode('utf-8')}")
        print(">>> DEPLOYMENT SUCCEEDED!")
    except Exception as e:
        print(f"Warning: Health check returned {e}")

    ssh.close()

if __name__ == "__main__":
    main()
