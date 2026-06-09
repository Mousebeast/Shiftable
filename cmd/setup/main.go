package main

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/ncruces/zenity"
)

// Set at build time: go build -ldflags="-X main.releaseTag=v1.2.0"
var releaseTag = "master"

const (
	appTitle = "Shiftable Setup"
	ghOrg    = "Mousebeast"
	ghRepo   = "shiftable"
)

func rawURL(path string) string {
	return fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/%s/%s", ghOrg, ghRepo, releaseTag, path)
}

func main() {
	if err := run(); err != nil {
		if !errors.Is(err, zenity.ErrCanceled) {
			_ = zenity.Error(err.Error(), zenity.Title(appTitle))
		}
		os.Exit(1)
	}
}

func run() error {
	// ── Admin check (Windows only) ────────────────────────────────────────────
	if !isElevated() {
		_ = zenity.Error(
			"Shiftable Setup needs administrator privileges.\n\n"+
				"Please close this window, right-click the installer,\n"+
				"and choose \"Run as administrator\".",
			zenity.Title(appTitle),
		)
		return zenity.ErrCanceled
	}

	// ── Welcome ───────────────────────────────────────────────────────────────
	err := zenity.Info(
		"Welcome to Shiftable Setup.\n\n"+
			"This wizard will configure and launch Shiftable on your computer.\n\n"+
			"Before continuing, make sure:\n"+
			"  • Docker Desktop is installed and running\n"+
			"  • You have a free DuckDNS account (duckdns.org)\n"+
			"  • Ports 80 and 443 are forwarded to this computer on your router",
		zenity.Title(appTitle),
		zenity.OKLabel("Let's go"),
	)
	if err != nil {
		return err
	}

	// ── Docker check ──────────────────────────────────────────────────────────
	if err := checkDocker(); err != nil {
		return err
	}

	// ── Collect inputs ────────────────────────────────────────────────────────
	cfg, err := collectInputs()
	if err != nil {
		return err
	}

	// ── Confirm ───────────────────────────────────────────────────────────────
	summary := fmt.Sprintf(
		"Ready to set up Shiftable:\n\n"+
			"  Restaurant:  %s\n"+
			"  URL:         https://%s.duckdns.org\n"+
			"  Admin:       %s <%s>\n"+
			"  Install dir: %s\n\n"+
			"This will take 2–3 minutes. Continue?",
		cfg.restaurantName, cfg.duckdnsSub, cfg.adminName, cfg.adminEmail, cfg.installDir,
	)
	if cfg.staging {
		summary += "\n\n(Using Let's Encrypt staging — for testing only)"
	}
	err = zenity.Question(summary, zenity.Title(appTitle), zenity.OKLabel("Install"), zenity.CancelLabel("Cancel"))
	if err != nil {
		return err
	}

	// ── Run setup ─────────────────────────────────────────────────────────────
	return setup(cfg)
}

// ── Input collection ──────────────────────────────────────────────────────────

type config struct {
	restaurantName string
	duckdnsSub     string
	duckdnsToken   string
	adminName      string
	adminEmail     string
	adminPin       string
	installDir     string
	staging        bool
}

func collectInputs() (*config, error) {
	cfg := &config{}
	var err error

	cfg.restaurantName, err = ask("What is your restaurant's name?", "", false)
	if err != nil {
		return nil, err
	}

	_ = zenity.Info(
		"Next, you need a free DuckDNS subdomain.\n\n"+
			"If you don't have one yet:\n"+
			"  1. Go to duckdns.org in a browser\n"+
			"  2. Sign in with Google or GitHub\n"+
			"  3. Create a subdomain (e.g. myrestaurant)\n"+
			"  4. Copy your token from the top of the page",
		zenity.Title(appTitle),
		zenity.OKLabel("Continue"),
	)

	cfg.duckdnsSub, err = ask("Your DuckDNS subdomain (just the name, not .duckdns.org):", "", false)
	if err != nil {
		return nil, err
	}
	cfg.duckdnsSub = strings.ToLower(strings.TrimSpace(cfg.duckdnsSub))

	cfg.duckdnsToken, err = ask("Your DuckDNS token:", "", false)
	if err != nil {
		return nil, err
	}

	cfg.adminName, err = ask("Your name (for the admin account):", "", false)
	if err != nil {
		return nil, err
	}

	cfg.adminEmail, err = ask("Your email address:", "", false)
	if err != nil {
		return nil, err
	}

	cfg.adminPin, err = ask("Choose a PIN (4–6 digits) for your admin account:", "", true)
	if err != nil {
		return nil, err
	}

	cfg.installDir = defaultInstallDir()
	dir, err := zenity.SelectFileSave(
		zenity.Title("Choose install folder"),
		zenity.Filename(cfg.installDir),
	)
	if err != nil && !errors.Is(err, zenity.ErrCanceled) {
		return nil, err
	}
	if dir != "" {
		cfg.installDir = dir
	}

	// Staging option (shown as a question for testing workflows)
	stagingErr := zenity.Question(
		"Is this a real installation or a test run?\n\n"+
			"Real install: issues a trusted SSL certificate.\n"+
			"Test run: uses Let's Encrypt staging — no rate limits,\n"+
			"but browsers will show a security warning.",
		zenity.Title(appTitle),
		zenity.OKLabel("Real install"),
		zenity.CancelLabel("Test run"),
	)
	cfg.staging = errors.Is(stagingErr, zenity.ErrCanceled)

	return cfg, nil
}

func ask(prompt, defaultVal string, password bool) (string, error) {
	opts := []zenity.Option{zenity.Title(appTitle), zenity.EntryText(defaultVal)}
	if password {
		opts = append(opts, zenity.HideText())
	}
	val, err := zenity.Entry(prompt, opts...)
	if err != nil {
		return "", err
	}
	val = strings.TrimSpace(val)
	if val == "" {
		_ = zenity.Error("This field is required.", zenity.Title(appTitle))
		return ask(prompt, defaultVal, password)
	}
	return val, nil
}

func defaultInstallDir() string {
	home, _ := os.UserHomeDir()
	if runtime.GOOS == "windows" {
		if docs := os.Getenv("USERPROFILE"); docs != "" {
			return filepath.Join(docs, "Shiftable")
		}
	}
	return filepath.Join(home, "Shiftable")
}

// ── Setup execution ───────────────────────────────────────────────────────────

func setup(cfg *config) error {
	domain := cfg.duckdnsSub + ".duckdns.org"

	// Create install directory
	if err := os.MkdirAll(filepath.Join(cfg.installDir, "docker"), 0755); err != nil {
		return fmt.Errorf("failed to create install directory: %w", err)
	}

	dlg, err := zenity.Progress(
		zenity.Title(appTitle),
		zenity.MaxValue(10),
	)
	if err != nil {
		return err
	}
	defer dlg.Close()

	step := func(n int, msg string) {
		_ = dlg.Value(n)
		_ = dlg.Text(msg)
	}

	// Download compose files
	step(1, "Downloading configuration files...")
	if err := downloadFile(rawURL("docker-compose.yml"), filepath.Join(cfg.installDir, "docker-compose.yml")); err != nil {
		return fmt.Errorf("failed to download docker-compose.yml: %w", err)
	}
	if err := downloadFile(rawURL("docker/nginx.conf.template"), filepath.Join(cfg.installDir, "docker", "nginx.conf.template")); err != nil {
		return fmt.Errorf("failed to download nginx.conf.template: %w", err)
	}

	// Write .env
	step(2, "Writing configuration...")
	if err := writeEnv(cfg, domain); err != nil {
		return fmt.Errorf("failed to write .env: %w", err)
	}

	// Write convenience scripts
	writeHelperScripts(cfg.installDir)

	// Start DuckDNS
	step(3, "Starting DuckDNS...")
	if err := compose(cfg.installDir, "up", "-d", "duckdns"); err != nil {
		return fmt.Errorf("failed to start DuckDNS: %w", err)
	}

	// Wait for DNS propagation
	step(4, "Waiting 60 seconds for DNS to propagate...")
	for i := 0; i < 12; i++ {
		time.Sleep(5 * time.Second)
		_ = dlg.Text(fmt.Sprintf("Waiting for DNS to propagate... (%ds)", (i+1)*5))
	}

	// Get SSL certificate
	step(5, "Requesting SSL certificate (this may take a minute)...")
	certArgs := []string{
		"run", "--rm", "-p", "80:80",
		"certbot", "certonly",
		"--standalone", "--non-interactive", "--agree-tos",
		"-m", cfg.adminEmail,
		"-d", domain,
	}
	if cfg.staging {
		certArgs = append(certArgs, "--staging")
	}
	if err := compose(cfg.installDir, certArgs...); err != nil {
		return fmt.Errorf("SSL certificate request failed: %w\n\nMake sure port 80 is forwarded to this computer and DNS has propagated.", err)
	}

	// Start all services
	step(7, "Starting all services...")
	if err := compose(cfg.installDir, "up", "-d"); err != nil {
		return fmt.Errorf("failed to start services: %w", err)
	}

	// Wait for healthy
	step(8, "Waiting for app to start...")
	for i := 0; i < 30; i++ {
		time.Sleep(2 * time.Second)
		out, _ := exec.Command("docker", "inspect", "--format={{.State.Health.Status}}",
			runOutput(cfg.installDir, "ps", "-q", "app")).Output()
		if strings.TrimSpace(string(out)) == "healthy" {
			break
		}
	}

	step(10, "Done!")
	dlg.Close()

	url := fmt.Sprintf("https://%s", domain)

	var successMsg string
	if cfg.staging {
		successMsg = fmt.Sprintf(
			"Test setup complete!\n\n"+
				"  URL:  %s\n\n"+
				"Your browser will show a security warning — this is expected\n"+
				"because staging certificates are not trusted by browsers.\n\n"+
				"Verify everything works, then re-run the wizard for a real install.\n\n"+
				"To restart Shiftable later, run start%s in your install folder.",
			url, scriptExt(),
		)
	} else {
		successMsg = fmt.Sprintf(
			"Shiftable is running!\n\n"+
				"  URL:  %s\n\n"+
				"Log in with your admin PIN to finish setup.\n\n"+
				"To restart Shiftable later, run start%s in your install folder.",
			url, scriptExt(),
		)
	}

	_ = zenity.Info(successMsg, zenity.Title(appTitle), zenity.OKLabel("Open"))

	// Try to open browser
	openBrowser(url)
	return nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func isElevated() bool {
	if runtime.GOOS != "windows" {
		return true
	}
	f, err := os.Open(`\\.\PHYSICALDRIVE0`)
	if err == nil {
		f.Close()
		return true
	}
	return false
}

func checkDocker() error {
	// Not installed at all — offer to download
	if _, err := exec.LookPath("docker"); err != nil {
		return offerDockerInstall()
	}
	// Installed but daemon may not be running — retry up to 3x
	for attempt := 1; attempt <= 3; attempt++ {
		if exec.Command("docker", "info").Run() == nil {
			return nil
		}
		err := zenity.Question(
			"Docker Desktop is not running.\n\nPlease start Docker Desktop and click Retry.",
			zenity.Title(appTitle),
			zenity.OKLabel("Retry"),
			zenity.CancelLabel("Cancel"),
		)
		if err != nil {
			return err
		}
	}
	return errors.New("Docker Desktop is not running. Please start it and re-run this wizard.")
}

func offerDockerInstall() error {
	err := zenity.Question(
		"Docker Desktop is not installed.\n\n"+
			"Shiftable runs inside Docker, so you'll need to install it first.\n\n"+
			"Click 'Download & Install' and we'll fetch the installer for you.\n"+
			"(The download is ~500 MB and may take a few minutes.)",
		zenity.Title(appTitle),
		zenity.OKLabel("Download"),
		zenity.CancelLabel("Cancel"),
	)
	if err != nil {
		return err
	}

	url := dockerInstallerURL()
	if url == "" {
		return errors.New("automatic Docker install is not supported on this platform")
	}
	installerPath := filepath.Join(os.TempDir(), dockerInstallerFilename())

	dlg, err := zenity.Progress(zenity.Title(appTitle), zenity.MaxValue(0))
	if err != nil {
		return err
	}
	_ = dlg.Text("Downloading Docker Desktop installer (~500 MB)...")
	downloadErr := downloadFile(url, installerPath)
	dlg.Close()
	if downloadErr != nil {
		return fmt.Errorf("failed to download Docker Desktop installer: %w", downloadErr)
	}

	if err := launchInstaller(installerPath); err != nil {
		return fmt.Errorf("failed to launch Docker Desktop installer: %w", err)
	}

	_ = zenity.Info(
		"The Docker Desktop installer is running.\n\n"+
			"Complete the installation, restart your computer if prompted,\n"+
			"then run this wizard again to continue.",
		zenity.Title(appTitle),
		zenity.OKLabel("Got it"),
	)
	return zenity.ErrCanceled
}

func dockerInstallerURL() string {
	switch runtime.GOOS {
	case "windows":
		return "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe"
	case "darwin":
		if runtime.GOARCH == "arm64" {
			return "https://desktop.docker.com/mac/main/arm64/Docker.dmg"
		}
		return "https://desktop.docker.com/mac/main/amd64/Docker.dmg"
	default:
		return ""
	}
}

func dockerInstallerFilename() string {
	if runtime.GOOS == "windows" {
		return "DockerDesktopInstaller.exe"
	}
	return "Docker.dmg"
}

func launchInstaller(path string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", "", path)
	case "darwin":
		cmd = exec.Command("open", path)
	default:
		return fmt.Errorf("unsupported platform")
	}
	return cmd.Start()
}

func downloadFile(url, dest string) error {
	resp, err := http.Get(url) //nolint:gosec
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("HTTP %d fetching %s", resp.StatusCode, url)
	}
	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, resp.Body)
	return err
}

func writeEnv(cfg *config, domain string) error {
	content := fmt.Sprintf(`# Shiftable configuration — generated by setup wizard
RESTAURANT_NAME=%s
ADMIN_NAME=%s
ADMIN_EMAIL=%s
ADMIN_PIN=%s
DUCKDNS_SUBDOMAIN=%s
DUCKDNS_TOKEN=%s
DOMAIN=%s
NODE_ENV=production
PORT=3000
DB_PATH=/app/data/shiftable.db
`,
		cfg.restaurantName, cfg.adminName, cfg.adminEmail, cfg.adminPin,
		cfg.duckdnsSub, cfg.duckdnsToken, domain,
	)
	if cfg.staging {
		content += "CERTBOT_STAGING=1\n"
	}
	return os.WriteFile(filepath.Join(cfg.installDir, ".env"), []byte(content), 0600)
}

func writeHelperScripts(dir string) {
	if runtime.GOOS == "windows" {
		_ = os.WriteFile(filepath.Join(dir, "start.bat"),
			[]byte("@echo off\ndocker compose up -d\necho Shiftable started.\npause\n"), 0755)
		_ = os.WriteFile(filepath.Join(dir, "stop.bat"),
			[]byte("@echo off\ndocker compose down\necho Shiftable stopped.\npause\n"), 0755)
	} else {
		_ = os.WriteFile(filepath.Join(dir, "start.sh"),
			[]byte("#!/bin/sh\ndocker compose up -d\necho Shiftable started.\n"), 0755)
		_ = os.WriteFile(filepath.Join(dir, "stop.sh"),
			[]byte("#!/bin/sh\ndocker compose down\necho Shiftable stopped.\n"), 0755)
	}
}

func compose(dir string, args ...string) error {
	cmd := exec.Command("docker", append([]string{"compose"}, args...)...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%w\n%s", err, string(out))
	}
	return nil
}

func runOutput(dir string, args ...string) string {
	cmd := exec.Command("docker", append([]string{"compose"}, args...)...)
	cmd.Dir = dir
	out, _ := cmd.Output()
	return strings.TrimSpace(string(out))
}

func scriptExt() string {
	if runtime.GOOS == "windows" {
		return ".bat"
	}
	return ".sh"
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}
