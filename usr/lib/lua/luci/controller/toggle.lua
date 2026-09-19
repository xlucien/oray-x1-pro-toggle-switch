module("luci.controller.toggle", package.seeall)

local nixio = require("nixio")
local json  = require("luci.jsonc")

local function cfg_get(key, default)
    local f = io.popen(string.format("uci -q get x1pro-toggle.main.%s 2>/dev/null", key))
    if not f then return default end
    local value = f:read("*l")
    f:close()
    if value and value ~= "" then return value:gsub("%s+", "") end
    return default
end

local function cfg_set_bool(key, value)
    value = (value == "1") and "1" or "0"
    os.execute(string.format("uci -q set x1pro-toggle.main.%s='%s'", key, value))
end

local function physical_state()
    local f = io.open("/tmp/x1pro-toggle-state", "r")
    if not f then return "0" end
    local value = f:read("*l")
    f:close()
    return value == "1" and "1" or "0"
end

local function apply_current_state()
    local level = physical_state() == "1" and "high" or "low"
    os.execute(string.format("/usr/sbin/x1pro-toggle-apply %s force >/dev/null 2>&1 &", level))
end

function index()
    if not nixio.fs.access("/etc/config/x1pro-toggle") then return end
    entry({"admin", "system", "toggle"}, template("toggle/index"), _("Toggle Switch"), 60)
    entry({"admin", "system", "toggle", "api"}, call("api")).leaf = true
end

local function json_out(data, status)
    local http = require("luci.http")
    http.status(status or 200, "OK")
    http.header("Cache-Control", "no-store, no-cache, must-revalidate")
    http.prepare_content("application/json")
    http.write(json.stringify(data))
end

function api()
    local http = require("luci.http")
    local method = http.getenv("REQUEST_METHOD") or "GET"

    if method == "GET" then
        local physical = physical_state()
        json_out({ success = true, data = {
            global_enabled = cfg_get("global_enabled", "0") == "1",
            led_enabled = cfg_get("led_enabled", "0") == "1",
            led_left_action = cfg_get("led_high_action", "1") == "1",
            led_right_action = cfg_get("led_low_action", "0") == "1",
            wifi_enabled = cfg_get("wifi_enabled", "0") == "1",
            wifi_left_action = cfg_get("wifi_high_action", "0") == "1",
            wifi_right_action = cfg_get("wifi_low_action", "1") == "1",
            passwall_enabled = cfg_get("passwall_enabled", "0") == "1",
            passwall_left_action = cfg_get("passwall_high_action", "1") == "1",
            passwall_right_action = cfg_get("passwall_low_action", "0") == "1",
            openclash_enabled = cfg_get("openclash_enabled", "0") == "1",
            openclash_left_action = cfg_get("openclash_high_action", "0") == "1",
            openclash_right_action = cfg_get("openclash_low_action", "1") == "1",
            ssr_enabled = cfg_get("ssr_enabled", "0") == "1",
            ssr_left_action = cfg_get("ssr_high_action", "1") == "1",
            ssr_right_action = cfg_get("ssr_low_action", "0") == "1",
            current_mode = physical == "1" and "0" or "1",
            default_led = cfg_get("led_name", "white:status")
        } })
        return
    end

    if method == "POST" and http.formvalue("action") == "save" then
        local old_wifi_enabled = cfg_get("wifi_enabled", "0")
        local new_wifi_enabled = http.formvalue("wifi_enabled") == "1" and "1" or "0"
        if old_wifi_enabled == "0" and new_wifi_enabled == "1" then
            os.execute("/usr/sbin/x1pro-toggle-wifi snapshot >/dev/null 2>&1")
        end
        local map = {
            global_enabled = "global_enabled",
            led_enabled = "led_enabled",
            led_left_action = "led_high_action",
            led_right_action = "led_low_action",
            wifi_enabled = "wifi_enabled",
            wifi_left_action = "wifi_high_action",
            wifi_right_action = "wifi_low_action",
            passwall_enabled = "passwall_enabled",
            passwall_left_action = "passwall_high_action",
            passwall_right_action = "passwall_low_action",
            openclash_enabled = "openclash_enabled",
            openclash_left_action = "openclash_high_action",
            openclash_right_action = "openclash_low_action",
            ssr_enabled = "ssr_enabled",
            ssr_left_action = "ssr_high_action",
            ssr_right_action = "ssr_low_action"
        }
        for form_key, uci_key in pairs(map) do
            cfg_set_bool(uci_key, http.formvalue(form_key) or "0")
        end
        os.execute("uci -q commit x1pro-toggle")
        if old_wifi_enabled == "1" and new_wifi_enabled == "0" then
            os.execute("/usr/sbin/x1pro-toggle-wifi restore >/dev/null 2>&1")
        end
        apply_current_state()
        json_out({ success = true })
        return
    end

    json_out({ success = false, error = "Invalid request" }, 400)
end
