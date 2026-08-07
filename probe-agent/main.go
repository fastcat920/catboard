package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const version = "1.0.0"

type Config struct {
	Panel       string `json:"panel"`
	ID          int64  `json:"id"`
	Secret      string `json:"secret"`
	PollSeconds int    `json:"poll_seconds"`
}
type Task struct {
	TaskID, ServerType, Host, CheckType   string
	ServerID                              int
	SnapshotID                            *int64
	Port, TimeoutSeconds, IntervalSeconds int
}
type taskWire struct {
	TaskID          string `json:"task_id"`
	ServerType      string `json:"server_type"`
	ServerID        int    `json:"server_id"`
	SnapshotID      *int64 `json:"snapshot_id"`
	Host            string `json:"host"`
	Port            int    `json:"port"`
	CheckType       string `json:"check_type"`
	TimeoutSeconds  int    `json:"timeout_seconds"`
	IntervalSeconds int    `json:"interval_seconds"`
}
type taskResponse struct {
	Data struct {
		Tasks []taskWire `json:"tasks"`
	} `json:"data"`
}
type Result struct {
	ServerType string `json:"server_type"`
	ServerID   int    `json:"server_id"`
	SnapshotID *int64 `json:"snapshot_id"`
	Success    bool   `json:"success"`
	LatencyMS  *int64 `json:"latency_ms"`
	ErrorCode  string `json:"error_code,omitempty"`
	CheckedAt  int64  `json:"checked_at"`
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "install" {
		if err := install(os.Args[2:]); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}
	configPath := flag.String("config", "/etc/node-security-probe.json", "config file")
	flag.Parse()
	data, err := os.ReadFile(*configPath)
	fatal(err)
	var cfg Config
	fatal(json.Unmarshal(data, &cfg))
	if cfg.PollSeconds < 15 {
		cfg.PollSeconds = 30
	}
	client := &http.Client{Timeout: 20 * time.Second}
	last := map[string]time.Time{}
	for {
		tasks, err := fetchTasks(client, cfg)
		if err != nil {
			fmt.Fprintln(os.Stderr, time.Now().Format(time.RFC3339), err)
			time.Sleep(time.Duration(cfg.PollSeconds) * time.Second)
			continue
		}
		results := []Result{}
		now := time.Now()
		for _, task := range tasks {
			if next, ok := last[task.TaskID]; ok && now.Sub(next) < time.Duration(task.IntervalSeconds)*time.Second {
				continue
			}
			results = append(results, check(task))
			last[task.TaskID] = now
		}
		if len(results) > 0 {
			if err := submit(client, cfg, results); err != nil {
				fmt.Fprintln(os.Stderr, time.Now().Format(time.RFC3339), err)
			}
		}
		time.Sleep(time.Duration(cfg.PollSeconds) * time.Second)
	}
}

func fetchTasks(client *http.Client, cfg Config) ([]taskWire, error) {
	var out taskResponse
	if err := request(client, cfg, http.MethodGet, "/api/v1/security/probe/tasks", nil, &out); err != nil {
		return nil, err
	}
	return out.Data.Tasks, nil
}
func submit(client *http.Client, cfg Config, results []Result) error {
	return request(client, cfg, http.MethodPost, "/api/v1/security/probe/results", map[string]interface{}{"results": results}, nil)
}
func request(client *http.Client, cfg Config, method, path string, payload, out interface{}) error {
	body := []byte{}
	var err error
	if payload != nil {
		body, err = json.Marshal(payload)
		if err != nil {
			return err
		}
	}
	base, err := url.Parse(strings.TrimRight(cfg.Panel, "/"))
	if err != nil || base.Scheme != "https" {
		return errors.New("panel must be a valid https URL")
	}
	base.Path = path
	req, err := http.NewRequestWithContext(context.Background(), method, base.String(), bytes.NewReader(body))
	if err != nil {
		return err
	}
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	nonceBytes := make([]byte, 16)
	if _, err = rand.Read(nonceBytes); err != nil {
		return err
	}
	nonce := hex.EncodeToString(nonceBytes)
	signature := sign(cfg.Secret, method, path, ts, nonce, body)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Probe-Id", strconv.FormatInt(cfg.ID, 10))
	req.Header.Set("X-Probe-Timestamp", ts)
	req.Header.Set("X-Probe-Nonce", nonce)
	req.Header.Set("X-Probe-Signature", signature)
	req.Header.Set("X-Probe-Version", version)
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("panel returned %d: %s", resp.StatusCode, string(raw))
	}
	if out != nil {
		return json.Unmarshal(raw, out)
	}
	return nil
}

func sign(secret, method, path, timestamp, nonce string, body []byte) string {
	hash := sha256.Sum256(body)
	message := strings.ToUpper(method) + "\n" + path + "\n" + timestamp + "\n" + nonce + "\n" + hex.EncodeToString(hash[:])
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(message))
	return hex.EncodeToString(mac.Sum(nil))
}
func check(task taskWire) Result {
	result := Result{ServerType: task.ServerType, ServerID: task.ServerID, SnapshotID: task.SnapshotID, CheckedAt: time.Now().Unix()}
	timeout := time.Duration(task.TimeoutSeconds) * time.Second
	if timeout < time.Second {
		timeout = 3 * time.Second
	}
	start := time.Now()
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(task.Host, strconv.Itoa(task.Port)), timeout)
	if err != nil {
		result.ErrorCode = classify(err)
		return result
	}
	conn.Close()
	ms := time.Since(start).Milliseconds()
	result.Success = true
	result.LatencyMS = &ms
	return result
}
func classify(err error) string {
	if e, ok := err.(net.Error); ok && e.Timeout() {
		return "timeout"
	}
	s := strings.ToLower(err.Error())
	if strings.Contains(s, "refused") {
		return "refused"
	}
	if strings.Contains(s, "no route") {
		return "no_route"
	}
	return "network_error"
}
func install(args []string) error {
	fs := flag.NewFlagSet("install", flag.ContinueOnError)
	panel := fs.String("panel", "", "panel HTTPS URL")
	id := fs.Int64("id", 0, "probe id")
	secret := fs.String("secret", "", "probe secret")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if os.Geteuid() != 0 {
		return errors.New("install must run as root")
	}
	if *panel == "" || *id < 1 || *secret == "" {
		return errors.New("panel, id and secret are required")
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	target := "/usr/local/bin/node-security-probe"
	if filepath.Clean(exe) != target {
		input, err := os.ReadFile(exe)
		if err != nil {
			return err
		}
		if err = os.WriteFile(target, input, 0755); err != nil {
			return err
		}
	}
	cfg, _ := json.MarshalIndent(Config{Panel: *panel, ID: *id, Secret: *secret, PollSeconds: 30}, "", "  ")
	if err = os.WriteFile("/etc/node-security-probe.json", cfg, 0600); err != nil {
		return err
	}
	unit := "[Unit]\nDescription=Catboard private node security probe\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nExecStart=/usr/local/bin/node-security-probe\nRestart=always\nRestartSec=5\nNoNewPrivileges=true\nPrivateTmp=true\nProtectSystem=strict\nProtectHome=true\nReadOnlyPaths=/etc/node-security-probe.json\n\n[Install]\nWantedBy=multi-user.target\n"
	if err = os.WriteFile("/etc/systemd/system/node-security-probe.service", []byte(unit), 0644); err != nil {
		return err
	}
	for _, a := range [][]string{{"daemon-reload"}, {"enable", "--now", "node-security-probe"}} {
		cmd := exec.Command("systemctl", a...)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("systemctl: %s: %w", out, err)
		}
	}
	fmt.Println("node-security-probe installed and started")
	return nil
}
func fatal(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
