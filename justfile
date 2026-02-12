server_dir := "server"

# List available recipes
default:
    @just --list

# Build the server binary
build:
    cd {{server_dir}} && go build -o bin/wisdom ./cmd/wisdom

# Run the server
run:
    cd {{server_dir}} && go run ./cmd/wisdom

# Run the server in watch mode (includes UI watch/build)
dev:
    ./scripts/dev.sh

# Run tests
test:
    cd {{server_dir}} && go test ./...

# Run tests with verbose output
test-verbose:
    cd {{server_dir}} && go test -v ./...

# Vet the code
vet:
    cd {{server_dir}} && go vet ./...

# Format the code
fmt:
    cd {{server_dir}} && gofmt -w .

# Check formatting (fails if files need formatting)
fmt-check:
    cd {{server_dir}} && test -z "$(gofmt -l .)"

# Tidy module dependencies
tidy:
    cd {{server_dir}} && go mod tidy

# Clean build artifacts
clean:
    rm -rf {{server_dir}}/bin {{server_dir}}/tmp

# Bundle UI + example configs
bundle:
    ./scripts/bundle.sh

# Run vet and fmt-check
check: vet fmt-check
