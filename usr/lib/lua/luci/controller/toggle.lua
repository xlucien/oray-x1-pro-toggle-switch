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

local function valid_proxy_target(value)
    local valid = { auto=true, passwall=true, openclash=true, ssrplus=true,
        nikki=true, daed=true, homeproxy=true, mihomo=true }
    return valid[value] and value or "auto"
end

local function proxy_status(target)
    target = valid_proxy_target(target or cfg_get("proxy_target", "auto"))
    local f = io.popen("/usr/sbin/x1pro-toggle-proxy status " .. target .. " 2>/dev/null")
    local result = { target = "none", state = "not_installed", configured = false, running = false }
    if not f then return result end
    for line in f:lines() do
        local key, value = line:match("^([a-z_]+)=(.*)$")
        if key == "target" or key == "state" then result[key] = value
        elseif key == "configured" or key == "running" then result[key] = value == "1" end
    end
    f:close()
    return result
end

local function valid_reset_action(value)
    local valid = { wifi=true, led=true, reboot=true }
    return valid[value] and value or "wifi"
end

local function reset_status()
    local f = io.open("/tmp/x1pro-reset/last", "r")
    local result = { gesture = "none", action = "none", result = "none", time = "" }
    if not f then return result end
    for line in f:lines() do
        local key, value = line:match("^([a-z_]+)=(.*)$")
        if key and result[key] ~= nil then result[key] = value end
    end
    f:close()
    return result
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
        if http.formvalue("brief") == "1" then
            json_out({ success = true, data = { current_mode = physical == "1" and "0" or "1" } })
            return
        end
        local proxy = proxy_status()
        json_out({ success = true, data = {
            global_enabled = cfg_get("global_enabled", "0") == "1",
            led_enabled = cfg_get("led_enabled", "0") == "1",
            led_left_action = cfg_get("led_high_action", "1") == "1",
            led_right_action = cfg_get("led_low_action", "0") == "1",
            wifi_enabled = cfg_get("wifi_enabled", "0") == "1",
            wifi_left_action = cfg_get("wifi_high_action", "0") == "1",
            wifi_right_action = cfg_get("wifi_low_action", "1") == "1",
            proxy_enabled = cfg_get("proxy_enabled", "0") == "1",
            proxy_target = cfg_get("proxy_target", "auto"),
            proxy_left_action = cfg_get("proxy_high_action", "0") == "1",
            proxy_right_action = cfg_get("proxy_low_action", "1") == "1",
            proxy_status = proxy,
            reset_single_enabled = cfg_get("reset_single_enabled", "0") == "1",
            reset_single_action = cfg_get("reset_single_action", "wifi"),
            reset_double_enabled = cfg_get("reset_double_enabled", "0") == "1",
            reset_double_action = cfg_get("reset_double_action", "led"),
            reset_triple_enabled = cfg_get("reset_triple_enabled", "0") == "1",
            reset_triple_action = cfg_get("reset_triple_action", "reboot"),
            reset_status = reset_status(),
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

    if method == "POST" and http.formvalue("action") == "detect_proxy" then
        json_out({ success = true, proxy_status = proxy_status(http.formvalue("proxy_target")) })
        return
    end

    local requested_action = http.formvalue("action")
    if method == "POST" and (requested_action == "save" or requested_action == "save_only") then
        local old_wifi_enabled = cfg_get("wifi_enabled", "0")
        local new_led_enabled = http.formvalue("led_enabled") == "1" and "1" or "0"
        local new_wifi_enabled = http.formvalue("wifi_enabled") == "1" and "1" or "0"
        local old_proxy_enabled = cfg_get("proxy_enabled", "0")
        local old_proxy_target = cfg_get("proxy_target", "auto")
        local new_proxy_enabled = http.formvalue("proxy_enabled") == "1" and "1" or "0"
        local new_proxy_target = valid_proxy_target(http.formvalue("proxy_target") or "auto")
        local enabled_count = (new_led_enabled == "1" and 1 or 0) +
            (new_wifi_enabled == "1" and 1 or 0) + (new_proxy_enabled == "1" and 1 or 0)
        if enabled_count > 1 then
            json_out({ success = false, error = "LED, WiFi and proxy control are mutually exclusive" }, 400)
            return
        end
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
            proxy_enabled = "proxy_enabled",
            proxy_left_action = "proxy_high_action",
            proxy_right_action = "proxy_low_action",
            reset_single_enabled = "reset_single_enabled",
            reset_double_enabled = "reset_double_enabled",
            reset_triple_enabled = "reset_triple_enabled",
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
        os.execute(string.format("uci -q set x1pro-toggle.main.proxy_target='%s'", new_proxy_target))
        for _, gesture in ipairs({"single", "double", "triple"}) do
            local action = valid_reset_action(http.formvalue("reset_" .. gesture .. "_action") or "wifi")
            os.execute(string.format("uci -q set x1pro-toggle.main.reset_%s_action='%s'", gesture, action))
        end
        os.execute("uci -q commit x1pro-toggle")
        os.execute("/usr/sbin/x1pro-reset-control clear >/dev/null 2>&1")
        if old_wifi_enabled == "1" and new_wifi_enabled == "0" then
            os.execute("/usr/sbin/x1pro-toggle-wifi restore >/dev/null 2>&1")
        end
        if new_proxy_enabled == "1" and (old_proxy_enabled == "0" or old_proxy_target ~= new_proxy_target) then
            os.execute("/usr/sbin/x1pro-toggle-proxy snapshot >/dev/null 2>&1")
        elseif old_proxy_enabled == "1" and new_proxy_enabled == "0" then
            os.execute("/usr/sbin/x1pro-toggle-proxy restore >/dev/null 2>&1")
        end
        if requested_action == "save" then
            apply_current_state()
        end
        json_out({ success = true, applied = requested_action == "save", proxy_status = proxy_status(new_proxy_target) })
        return
    end

    json_out({ success = false, error = "Invalid request" }, 400)
end
