# USB Screen Share

This folder is a small local website for sharing one computer's screen with another device. The media travels directly between the two browsers through WebRTC. The Node server only serves the website and relays the connection handshake.

## Quick start on Windows

1. Copy the entire folder to a USB drive.
2. On the computer that will share its screen, double-click `START_SCREEN_SHARE.bat`.
3. Allow the first-run download if Node.js is not already installed. The launcher stores the portable runtime in `runtime-node` on the USB drive.
4. Choose **Share this screen**, click **Start sharing**, and copy the room code.
5. On the other device, open `http://HOST-IP:3000`, choose **Watch a screen**, enter a display name and the code. The QR code is also shown on the host. For the QR to work, open the host page using its LAN address rather than `localhost` before scanning.

The host and viewer should be on the same Wi-Fi or local network. Both devices need a current Chrome, Edge, or Firefox browser. The browser will ask the host to choose a window, tab, or full display.

## Viewer names and control access

Each viewer enters a name before joining. The host sees connected viewer names in **Viewer Access** and can approve or remove the control permission. The viewer can then send a control request over the connection.

Important limitation: a normal web page cannot inject mouse or keyboard input into the host computer's operating system. This build safely implements the named permission and control-message channel, but it does not pretend that browser events are desktop control. Actual remote mouse and keyboard control requires a separately installed, signed native helper with its own OS permission prompts. Screen sharing itself remains view-only.

## Manual start

If Node.js is already installed, open a terminal in this folder and run:

```text
npm install
npm start
```

Then open `http://localhost:3000` on the host. To let another device reach the host, find the host computer's local IP address and open `http://HOST-IP:3000` on the viewer device. Windows Firewall may ask permission for Node.js; allow it on private networks.

## USB and network notes

- The first launch needs internet access to download Node.js or the `ws` library. Later launches can use the copy stored on the USB drive.
- The USB drive does not make devices reachable from the public internet. For remote networks, use a VPN or deploy the server behind HTTPS and a suitable WebRTC networking service.
- Screen capture is restricted by browsers to secure contexts. `localhost` works for the host. A plain local-network HTTP address may be blocked by some browser configurations; HTTPS is recommended for networks where that happens.
- The QR endpoint runs locally and generates the image on the host; no QR data is sent to a third-party service.
- Room codes are temporary in-memory identifiers, not passwords. Anyone who obtains a code and can reach the server may join, so use a fresh room and stop the server when finished.
- WebRTC media is encrypted in transit, but this local HTTP setup does not authenticate the host or protect the room from an attacker on the same network. Do not use it for sensitive screens on an untrusted network.
- Stop the server by closing the Node.js console window opened by the launcher.