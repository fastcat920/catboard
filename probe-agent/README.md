# Private node security probe

Build on any machine with Go 1.20+:

```bash
cd probe-agent
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o node-security-probe .
```

An amd64 static binary is bundled at `public/downloads/node-security-probe-linux-amd64`. Create a probe in the node-security admin and run its generated one-line installation command; the command downloads the binary from your own panel and verifies its SHA-256 checksum before installing it.

The agent requires only outbound HTTPS access to the panel and outbound TCP access to monitored nodes. Its config is stored as root-only `/etc/node-security-probe.json`. For ARM64 servers, build from source with `GOARCH=arm64` and run the displayed `install` arguments with that binary.
