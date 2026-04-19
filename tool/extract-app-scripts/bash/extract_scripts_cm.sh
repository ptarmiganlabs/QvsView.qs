#!/bin/bash
set -euo pipefail

# =============================================================================
# Tool: Extract App Scripts (Qlik Sense Client-Managed)
# =============================================================================
# Usage: ./extract_scripts_cm.sh
# Requirements: Ctrl-Q tool, Qlik Sense certificates in PEM format
# Config: Edit the === Config === section below
# Output: ./output/YYYY-MM-DD_HHMMSS/*.qvs + optional latest/ folder
# =============================================================================

# === Config: Qlik Sense Connection ===
QS_HOST="qlikserver.domain.com"
QS_PORT="4242"                   # QRS API port (for app list)
QS_ENGINE_PORT="4747"           # Engine port (for script extraction)
QS_VIRTUAL_PROXY=""             # Virtual proxy prefix (e.g., "/qvd")
QS_AUTH_TYPE="cert"             # "cert" or "sense"
QS_AUTH_USER_DIR=""             # User directory for cert auth
QS_AUTH_USER_ID=""              # User ID for cert auth
QS_CERT_FILE="./cert/client.pem"
QS_CERT_KEY_FILE="./cert/client_key.pem"
QS_ROOT_CERT_FILE="./cert/root.pem"
INSECURE_SSL=false              # Skip SSL verification (for self-signed certs)

# === Config: Ctrl-Q Tool ===
CTRLQ_BIN="/path/to/ctrl-q"

# === Config: App Filter ===
# Filter apps by tags. Empty = all apps. Multiple tags = OR logic.
APP_TAGS=()

# === Config: Output ===
DEST_ROOT="./output"
ENABLE_TIMESTAMP_FOLDER=true    # Create YYYY-MM-DD_HHMMSS subfolder
ENABLE_LATEST_FOLDER=true      # Copy files to "latest" folder

# === Config: Logging ===
DEBUG_MODE=false                # Set to true for verbose debug output

# === Config: Retention ===
RETENTION_DAYS=30               # Delete folders older than N days
RETENTION_ENABLED=true         # Enable retention cleanup

# =============================================================================
# Script Logic - Edit below only if you need to customize the extraction flow
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
XRFKEY="1234567890abcdef"     # gitleaks:allow
# Required for Qlik QRS API xrfkey validation

# === Logging functions for INFO, DEBUG, WARN, ERROR ===
log_info() {
    echo "[$(date +"%Y-%m-%d %H:%M:%S")] INFO: $*"
}

log_debug() {
    # Only output when DEBUG_MODE is enabled (uses || true to prevent exit on false condition)
    [[ "$DEBUG_MODE" == "true" ]] && echo "[$(date +"%Y-%m-%d %H:%M:%S")] DEBUG: $*" >&2 || true
}

log_warn() {
    echo "[$(date +"%Y-%m-%d %H:%M:%S")] WARN: $*" >&2
}

log_error() {
    echo "[$(date +"%Y-%m-%d %H:%M:%S")] ERROR: $*" >&2
}

# === Retention: Delete old timestamped folders ===
cleanup_old_folders() {
    local dest_root="$1"
    local retention_days="$2"

    if [[ ! -d "$dest_root" ]]; then
        return
    fi

    log_info "Checking for folders older than $retention_days days in $dest_root"

    # Calculate cutoff date (macOS compatible)
    local cutoff_date
    cutoff_date=$(date -v-"${retention_days}d" +"%Y-%m-%d" 2>/dev/null || date -d "-${retention_days} days" +"%Y-%m-%d")

    # Find and process timestamped folders matching YYYY-MM-DD_HHMMSS pattern
    find "$dest_root" -maxdepth 1 -type d -name "[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]_[0-9][0-9][0-9][0-9][0-9][0-9]" |
    while read -r folder; do
        local folder_name
        folder_name=$(basename "$folder")
        local folder_date="${folder_name:0:10}"

        if [[ "$folder_date" < "$cutoff_date" ]]; then
            log_info "Removing old folder: $folder_name"
            rm -rf "$folder"
        fi
    done
}

# === QRS API: Fetch app list with optional tag filtering ===
get_apps_from_qrs() {
    local host="$1"
    local cert="$2"
    local key="$3"
    local root_cert="$4"
    local insecure_ssl="$5"
    shift 5

    log_debug "Fetching apps from QRS: host=$host, tags=$@"

    local url="https://${host}:${QS_PORT}/qrs/app/full?Xrfkey=${XRFKEY}"

    # Build filter clause for tag filtering (OR logic for multiple tags)
    if [[ $# -gt 0 ]]; then
        local tag_list=("$@")
        local num_tags=${#tag_list[@]}

        local filter_clause=""
        for ((i=0; i<num_tags; i++)); do
            local tag="${tag_list[$i]}"
            if [[ -n "$tag" ]]; then
                filter_clause+="tags.name eq '$tag'"
                if [[ $i -lt $((num_tags-1)) ]]; then
                    filter_clause+=" or "
                fi
            fi
        done

        # URL-encode the filter for QRS API
        if [[ -n "$filter_clause" ]]; then
            local encoded_filter
            encoded_filter=$(echo "$filter_clause" | sed 's/ /%20/g; s/=/%3D/g' | sed "s/'/%27/g")
            url+="&filter=$encoded_filter"
        fi
    fi

    # Build curl options for certificate authentication
    local curl_opts=(-s -L --cert "$cert" --key "$key" --cacert "$root_cert" \
        -H "Accept: application/json" \
        -H "x-Qlik-Xrfkey: ${XRFKEY}" \
        -H "X-Qlik-User: UserDirectory=Internal; UserId=sa_repository")
    if [[ "$insecure_ssl" == "true" ]]; then
        curl_opts+=(-k)
    fi

    log_debug "QRS API URL: $url"

    # Make request and capture response + HTTP status code
    local response
    local http_code
    response=$(curl "${curl_opts[@]}" -w "%{http_code}" "$url" 2>&1)
    http_code="${response: -3}"
    local body="${response:0:${#response} -3}"

    log_debug "QRS HTTP status: $http_code"

    # Check for error response
    if [[ "$http_code" != "200" ]]; then
        log_warn "QRS API error: $body"
        echo "[]"
        return
    fi

    # Return JSON body
    echo "$body"
}

# === Ctrl-Q: Extract script from a single app ===
extract_app_script() {
    local ctrlq_bin="${1}"
    local host="${2}"
    local port="${3}"
    local virtual_proxy="${4}"
    local auth_type="${5}"
    local auth_user_dir="${6}"
    local auth_user_id="${7}"
    local cert_file="${8}"
    local cert_key_file="${9}"
    local root_cert_file="${10}"
    local app_id="${11}"
    local app_name="${12}"
    local output_path="${13}"
    local insecure_ssl="${14}"

    log_debug "Extracting script: app=$app_name (ID: $app_id)"

    # Build Ctrl-Q command arguments
    local args=(
        "$ctrlq_bin" qseow script-get
        --host "$host"
        --port "$port"
        --app-id "$app_id"
        --auth-type "$auth_type"
        --open-without-data true
        --log-level "warn"
    )

    if [[ "$insecure_ssl" == "true" ]]; then
        args+=(--secure false)
    else
        args+=(--secure true)
    fi

    if [[ -n "$virtual_proxy" ]]; then
        args+=(--virtual-proxy "$virtual_proxy")
    fi

    args+=(
        --auth-user-dir "$auth_user_dir"
        --auth-user-id "$auth_user_id"
        --auth-cert-file "$cert_file"
        --auth-cert-key-file "$cert_key_file"
        --auth-root-cert-file "$root_cert_file"
    )

    # Execute Ctrl-Q and capture output
    local script_content
    script_content=$("${args[@]}" 2>&1)
    local ctrlq_exit=$?

    if [[ $ctrlq_exit -ne 0 ]] || [[ -z "$script_content" ]]; then
        log_error "Ctrl-Q failed for $app_name (exit=$ctrlq_exit)"
        return 1
    fi

    # Write script to file
    echo "$script_content" > "$output_path"
    log_info "Extracted: $app_name -> $output_path"
}

# === Parser: Extract app ID and name from QRS JSON response ===
parse_app_entries() {
    local json="$1"

    # Prefer jq if available, fallback to grep
    if command -v jq &>/dev/null; then
        local result
        result=$(jq -r '.[] | "\(.id)|\(.name)"' <<< "$json" 2>&1)
        local jq_status=$?

        if [[ $jq_status -eq 0 && -n "$result" ]]; then
            echo "$result"
        else
            log_warn "jq parsing failed: $result"
            echo ""
        fi
    else
        local entries
        entries=$(echo "$json" | grep -oE '"id":"[a-f0-9-]{36}"[^}]*"name":"[^"]*"' | sed -E 's/"id":"([a-f0-9-]{36})"[^}]*"name":"([^"]*)"/\1|\2/g')
        echo "$entries"
    fi
}

# === Main: Orchestrate the extraction flow ===
main() {
    log_info "Starting extraction for Qlik Sense: $QS_HOST"

    # Validate Ctrl-Q binary
    if [[ ! -x "$CTRLQ_BIN" ]]; then
        log_error "Ctrl-Q not found: $CTRLQ_BIN"
        exit 1
    fi

    # Create output directory
    if [[ ! -d "$DEST_ROOT" ]]; then
        mkdir -p "$DEST_ROOT"
    fi

    # Determine output folder (timestamped or flat)
    local output_folder="$DEST_ROOT"
    if [[ "$ENABLE_TIMESTAMP_FOLDER" == "true" ]]; then
        output_folder="$DEST_ROOT/$TIMESTAMP"
        mkdir -p "$output_folder"
        log_info "Created folder: $output_folder"
    fi

    # Validate certificate files
    if [[ ! -f "$QS_CERT_FILE" ]]; then
        log_error "Certificate not found: $QS_CERT_FILE"
        exit 1
    fi

    # Fetch app list from QRS API
    log_info "Fetching app list from QRS API..."
    local apps_json
    if [[ ${#APP_TAGS[@]:-0} -gt 0 ]]; then
        apps_json=$(get_apps_from_qrs "$QS_HOST" "$QS_CERT_FILE" "$QS_CERT_KEY_FILE" "$QS_ROOT_CERT_FILE" "$INSECURE_SSL" "${APP_TAGS[@]}")
    else
        apps_json=$(get_apps_from_qrs "$QS_HOST" "$QS_CERT_FILE" "$QS_CERT_KEY_FILE" "$QS_ROOT_CERT_FILE" "$INSECURE_SSL")
    fi

    if [[ -z "$apps_json" || "$apps_json" == "[]" ]]; then
        log_error "No apps found or QRS connection failed"
        exit 1
    fi

    # Process each app
    local total_extracted=0
    local total_failed=0
    local entries
    entries=$(parse_app_entries "$apps_json")

    log_info "Processing apps..."

    while IFS='|' read -r app_id app_name; do
        [[ -z "$app_id" ]] && continue

        if [[ -z "$app_name" ]]; then
            app_name="app_$app_id"
        fi

        # Sanitize filename (preserve Unicode)
        local safe_app_name
        safe_app_name=$(echo "$app_name" | sed 's/[\/\\:*?"<>|]/_/g' | cut -c1-150)
        local output_file="$output_folder/${safe_app_name}_${app_id}.qvs"

        # Extract script via Ctrl-Q
        if extract_app_script "$CTRLQ_BIN" "$QS_HOST" "$QS_ENGINE_PORT" "$QS_VIRTUAL_PROXY" \
            "$QS_AUTH_TYPE" "$QS_AUTH_USER_DIR" "$QS_AUTH_USER_ID" \
            "$QS_CERT_FILE" "$QS_CERT_KEY_FILE" "$QS_ROOT_CERT_FILE" \
            "$app_id" "$app_name" "$output_file" "$INSECURE_SSL"; then
            ((total_extracted++))

            # Copy to latest folder
            if [[ "$ENABLE_LATEST_FOLDER" == "true" ]]; then
                local latest_folder="$DEST_ROOT/latest"
                mkdir -p "$latest_folder"
                cp "$output_file" "$latest_folder/${safe_app_name}_${app_id}.qvs"
            fi
        else
            ((total_failed++))
        fi
    done <<< "$entries"

    # Create app_mapping.csv for traceability
    local csv_file="$output_folder/app_mapping.csv"
    echo "app_id,app_name,file_name" > "$csv_file"
    while IFS='|' read -r csv_app_id csv_app_name; do
        [[ -z "$csv_app_id" ]] && continue
        if [[ -z "$csv_app_name" ]]; then
            csv_app_name="app_$csv_app_id"
        fi

        # Re-sanitize for mapping records to ensure file name match
        local csv_safe_app_name
        csv_safe_app_name=$(echo "$csv_app_name" | sed 's/[\/\\:*?"<>|]/_/g' | cut -c1-150)
        local csv_file_name="${csv_safe_app_name}_${csv_app_id}.qvs"

        echo "\"$csv_app_id\",\"$csv_app_name\",\"$csv_file_name\"" >> "$csv_file"
    done <<< "$entries"

    if [[ "$ENABLE_LATEST_FOLDER" == "true" ]]; then
        cp "$csv_file" "$DEST_ROOT/latest/app_mapping.csv"
    fi

    log_info "Mapping file: $csv_file"
    log_info "Complete: $total_extracted extracted, $total_failed failed"

    # Run retention cleanup
    if [[ "$RETENTION_ENABLED" == "true" && "$ENABLE_TIMESTAMP_FOLDER" == "true" ]]; then
        cleanup_old_folders "$DEST_ROOT" "$RETENTION_DAYS"
    fi

    log_info "Done!"
}

main "$@"