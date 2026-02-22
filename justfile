server_dir := "server"
ui_dir := "ui"

# List available recipes
default:
    @just --list

# Build the server binary (UI is built/served by the backend at runtime)
build: server-build

# Run the server (serves the UI)
run: server-run

# Run the server in watch mode (includes UI watch/build)
dev:
    ./scripts/dev.sh

# Run tests (server + UI)
test: server-test ui-test

# Run tests with verbose server output
test-verbose: server-test-verbose ui-test

# Vet the server code
vet: server-vet

# Format code (server + UI)
fmt: server-fmt ui-fmt

# Check formatting (server + UI)
fmt-check: server-fmt-check ui-fmt-check

# Tidy Go module dependencies
tidy: server-tidy

# Lint UI (server uses `vet`)
lint: ui-lint

# Clean build artifacts
clean:
    rm -rf {{server_dir}}/bin {{server_dir}}/tmp {{ui_dir}}/dist dist

# Bundle UI + example configs
bundle:
    ./scripts/bundle.sh

# Run CI-style checks across the repo (no installs)
check: vet fmt-check lint

# --- Backend (Go) ---

server-build:
    cd {{server_dir}} && go build -o bin/wisdom ./cmd/wisdom

server-run:
    cd {{server_dir}} && go run ./cmd/wisdom

server-test:
    cd {{server_dir}} && go test ./...

server-test-verbose:
    cd {{server_dir}} && go test -v ./...

server-vet:
    cd {{server_dir}} && go vet ./...

server-fmt:
    cd {{server_dir}} && gofmt -w .

server-fmt-check:
    cd {{server_dir}} && test -z "$(gofmt -l .)"

server-tidy:
    cd {{server_dir}} && go mod tidy

# --- Frontend (TypeScript/React) ---

ui-install:
    cd {{ui_dir}} && npm ci

ui-test:
    cd {{ui_dir}} && npm test

ui-lint:
    cd {{ui_dir}} && npm run lint

ui-fmt:
    cd {{ui_dir}} && npm run format

ui-fmt-check:
    cd {{ui_dir}} && npm run format:check
