(function() {
    'use strict';

    var apiUrl = '/cgi-bin/luci/admin/system/toggle/api';
    var app, errorDiv, statusText, globalSwitch;
    var featureSelect, leftAction, rightAction, activeFeature = 'none';
    var proxyPanel, proxyTarget, proxyStatusText, proxyDetectBtn;
    var resetControls = {}, featureSettings = {}, statusInterval = null;

    function $(s) { return document.querySelector(s); }
    function create(tag, attrs, children) {
        var el = document.createElement(tag); attrs = attrs || {};
        Object.keys(attrs).forEach(function(k) {
            if (k === 'text') el.textContent = attrs[k];
            else if (k === 'checked') el.checked = attrs[k] === true;
            else if (k === 'disabled') el.disabled = attrs[k] === true;
            else el.setAttribute(k, attrs[k]);
        });
        (children || []).forEach(function(c) { el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
        return el;
    }
    function option(value, label, selected) {
        var o = create('option', { value: value, text: label }); o.selected = selected === true; return o;
    }
    function selectWrap(select) {
        return create('span', { 'class': 'toggle-select-wrap' }, [select, create('span', { 'class': 'toggle-select-arrow', text: '▾' })]);
    }
    function formRow(label, field, description) {
        var row = create('div', { 'class': 'cbi-value' });
        row.appendChild(create('label', { 'class': 'cbi-value-title', text: label }));
        var body = create('div', { 'class': 'cbi-value-field' }, [field]);
        if (description) body.appendChild(create('div', { 'class': 'cbi-value-description', text: description }));
        row.appendChild(body); return row;
    }
    function makeSelect(items, value) {
        var select = create('select', { 'class': 'cbi-input-select' });
        items.forEach(function(item) { select.appendChild(option(item[0], item[1], item[0] === value)); });
        return select;
    }
    function showError(message) { errorDiv.style.display = 'block'; errorDiv.textContent = '错误：' + message; }
    function hideError() { if (errorDiv) errorDiv.style.display = 'none'; }

    function post(data, callback) {
        var payload = {}, request = new XMLHttpRequest();
        Object.keys(data).forEach(function(k) { payload[k] = data[k]; });
        if (typeof csrf_token !== 'undefined' && csrf_token) payload.token = csrf_token;
        var body = Object.keys(payload).map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(payload[k]); }).join('&');
        request.open('POST', apiUrl, true);
        request.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        if (typeof csrf_token !== 'undefined' && csrf_token) request.setRequestHeader('X-CSRF-Token', csrf_token);
        request.onload = function() {
            try {
                var response = JSON.parse(request.responseText || '{}');
                if (request.status !== 200 && !response.error) response.error = '请求失败：' + request.status;
                callback(response);
            } catch (e) { callback({ success: false, error: '服务器返回内容无效' }); }
        };
        request.onerror = function() { callback({ success: false, error: '网络错误' }); };
        request.send(body);
    }

    function updateMode(mode) { statusText.textContent = '当前拨杆位置：' + ((mode === '1' || mode === 1) ? '右侧' : '左侧'); }
    function fetchMode() {
        var request = new XMLHttpRequest();
        request.open('GET', apiUrl + '?brief=1&_=' + Date.now(), true);
        request.setRequestHeader('Cache-Control', 'no-cache');
        request.onload = function() {
            if (request.status !== 200) return;
            try { var r = JSON.parse(request.responseText); if (r.success && r.data) updateMode(r.data.current_mode); } catch (e) {}
        };
        request.send();
    }

    function featureFromData(data) {
        if (data.proxy_enabled) return 'proxy';
        if (data.wifi_enabled) return 'wifi';
        if (data.led_enabled) return 'led';
        return 'none';
    }
    function actionLabels(feature) {
        return feature === 'proxy' ? [['1', '恢复代理'], ['0', '关闭代理']] : [['1', '打开'], ['0', '关闭']];
    }
    function rememberFeatureActions() {
        if (activeFeature === 'none' || !leftAction || !rightAction || !leftAction.options.length || !rightAction.options.length) return;
        featureSettings[activeFeature].left = leftAction.value === '1';
        featureSettings[activeFeature].right = rightAction.value === '1';
    }
    function fillActions(select, feature, enabled) {
        select.innerHTML = '';
        actionLabels(feature).forEach(function(item) { select.appendChild(option(item[0], item[1], item[0] === (enabled ? '1' : '0'))); });
    }
    function updateProxyAvailability() {
        var enabled = activeFeature === 'proxy';
        proxyPanel.classList.toggle('is-disabled', !enabled);
        proxyTarget.disabled = !enabled; proxyDetectBtn.disabled = !enabled;
        proxyPanel.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    }
    function selectFeature(feature) {
        rememberFeatureActions(); activeFeature = feature;
        var disabled = feature === 'none'; leftAction.disabled = disabled; rightAction.disabled = disabled;
        if (disabled) {
            leftAction.innerHTML = '<option>—</option>'; rightAction.innerHTML = '<option>—</option>';
        } else {
            fillActions(leftAction, feature, featureSettings[feature].left);
            fillActions(rightAction, feature, featureSettings[feature].right);
        }
        updateProxyAvailability();
    }

    function proxyLabel(target) {
        return ({ none: '无', conflict: '多个代理', passwall: 'PassWall', openclash: 'OpenClash', ssrplus: 'SSR Plus',
            nikki: 'Nikki', daed: 'daed', homeproxy: 'HomeProxy', mihomo: 'MihomoTProxy' })[target] || target;
    }
    function renderProxyStatus(status) {
        status = status || { target: 'none', state: 'not_installed' };
        var labels = { not_installed: '未安装', installed: '已安装，未启用', running: '正在运行',
            error: '配置已启用，但启动异常', conflict: '检测到多个代理，请手动选择' };
        proxyStatusText.className = 'toggle-inline-status status-' + status.state;
        proxyStatusText.textContent = '当前状态：' + (status.target === 'none' ? '' : proxyLabel(status.target) + ' · ') + (labels[status.state] || status.state);
    }
    function buildProxySection(data) {
        proxyPanel = create('div', { 'class': 'ts-card toggle-subsection', id: 'proxy-settings' });
        proxyPanel.appendChild(create('h3', { text: '代理设置' }));
        proxyTarget = makeSelect([['auto', '自动检测'], ['passwall', 'PassWall'], ['openclash', 'OpenClash'],
            ['ssrplus', 'SSR Plus'], ['nikki', 'Nikki'], ['daed', 'daed'], ['homeproxy', 'HomeProxy'], ['mihomo', 'MihomoTProxy']], data.proxy_target || 'auto');
        proxyPanel.appendChild(formRow('代理程序', selectWrap(proxyTarget)));
        proxyStatusText = create('span', { 'class': 'toggle-inline-status' }); renderProxyStatus(data.proxy_status);
        proxyPanel.appendChild(formRow('检测状态', proxyStatusText));
        proxyDetectBtn = create('button', { type: 'button', 'class': 'btn cbi-button cbi-button-neutral', text: '重新检测' });
        proxyDetectBtn.addEventListener('click', function() {
            proxyDetectBtn.disabled = true;
            post({ action: 'detect_proxy', proxy_target: proxyTarget.value }, function(r) {
                proxyDetectBtn.disabled = activeFeature !== 'proxy';
                if (r.success) renderProxyStatus(r.proxy_status); else showError(r.error || '检测失败');
            });
        });
        proxyPanel.appendChild(formRow('', proxyDetectBtn));
        return proxyPanel;
    }

    function resetText(value, type) {
        var dict = {
            gesture: { single: '单击', double: '双击', triple: '三击', long: '长按', none: '无' },
            action: { wifi: '切换 WiFi', led: '切换灯光', reboot: '重启', factory_reset: '恢复出厂', none: '无' },
            result: { disabled: '未启用', led_on: '灯光已打开', led_off: '灯光已关闭', wifi_off: 'WiFi 已关闭',
                wifi_restored: 'WiFi 已恢复', no_wifi_snapshot: '没有可恢复的 WiFi 快照', executing: '执行中', unsupported: '不支持' }
        };
        return (dict[type] && dict[type][value]) || value;
    }
    function buildResetRow(gesture, label, data) {
        var enabled = create('input', { type: 'checkbox', 'class': 'cbi-input-checkbox', checked: data['reset_' + gesture + '_enabled'] === true });
        var action = makeSelect([['wifi', '切换 WiFi'], ['led', '切换灯光'], ['reboot', '重启']], data['reset_' + gesture + '_action']);
        resetControls[gesture] = { enabled: enabled, action: action };
        return formRow(label, create('span', { 'class': 'toggle-reset-controls' }, [enabled, selectWrap(action)]));
    }
    function buildResetSection(data) {
        var section = create('div', { 'class': 'ts-card toggle-section' });
        section.appendChild(create('h3', { text: 'RESET 按键控制' }));
        section.appendChild(create('div', { 'class': 'cbi-section-descr', text: '独立运行，不受拨杆总开关影响；连击判定时间为 1200 毫秒。' }));
        section.appendChild(buildResetRow('single', '单击', data));
        section.appendChild(buildResetRow('double', '双击', data));
        section.appendChild(buildResetRow('triple', '三击', data));
        section.appendChild(formRow('长按 5 秒', create('span', { 'class': 'label notice', text: '始终启用 · 恢复出厂设置' })));
        var recent = data.reset_status || {}, text = '暂无记录';
        if (recent.gesture && recent.gesture !== 'none') {
            text = resetText(recent.gesture, 'gesture') + ' · ' + resetText(recent.action, 'action') + ' · ' + resetText(recent.result, 'result');
            if (recent.time) text += ' · ' + recent.time;
        }
        section.appendChild(formRow('最近动作', create('span', { text: text })));
        return section;
    }

    function collectData(action) {
        rememberFeatureActions();
        var data = { action: action, global_enabled: globalSwitch.checked ? '1' : '0', proxy_target: proxyTarget.value };
        ['led', 'wifi', 'proxy'].forEach(function(feature) {
            data[feature + '_enabled'] = activeFeature === feature ? '1' : '0';
            data[feature + '_left_action'] = featureSettings[feature].left ? '1' : '0';
            data[feature + '_right_action'] = featureSettings[feature].right ? '1' : '0';
        });
        ['single', 'double', 'triple'].forEach(function(gesture) {
            data['reset_' + gesture + '_enabled'] = resetControls[gesture].enabled.checked ? '1' : '0';
            data['reset_' + gesture + '_action'] = resetControls[gesture].action.value;
        });
        return data;
    }
    function save(action, button) {
        hideError();
        var buttons = document.querySelectorAll('.toggle-actions button'), original = button.textContent;
        for (var i = 0; i < buttons.length; i++) buttons[i].disabled = true;
        button.textContent = '保存中…';
        post(collectData(action), function(r) {
            for (var j = 0; j < buttons.length; j++) buttons[j].disabled = false;
            if (!r.success) { button.textContent = original; showError(r.error || '保存失败'); return; }
            button.textContent = '已保存'; if (r.proxy_status) renderProxyStatus(r.proxy_status);
            setTimeout(function() { button.textContent = original; }, 1300);
        });
    }

    function buildUI(data) {
        app = $('#toggle-app'); errorDiv = $('#toggle-error'); app.innerHTML = ''; hideError();
        featureSettings = {
            led: { left: data.led_left_action === true, right: data.led_right_action === true },
            wifi: { left: data.wifi_left_action === true, right: data.wifi_right_action === true },
            proxy: { left: data.proxy_left_action === true, right: data.proxy_right_action === true }
        };
        statusText = create('div', { 'class': 'ts-status toggle-mode' }); updateMode(data.current_mode); app.appendChild(statusText);

        var main = create('div', { 'class': 'ts-global toggle-section' });
        main.appendChild(create('h3', { text: '拨杆控制' }));
        main.appendChild(create('div', { 'class': 'cbi-section-descr', text: 'LED、WiFi、代理三选一；总开关仅控制 GPIO0 拨杆功能。' }));
        globalSwitch = create('input', { type: 'checkbox', 'class': 'cbi-input-checkbox', checked: data.global_enabled === true });
        main.appendChild(formRow('总开关', globalSwitch));
        activeFeature = featureFromData(data);
        featureSelect = makeSelect([['none', '不启用'], ['led', 'LED'], ['wifi', 'WiFi'], ['proxy', '代理']], activeFeature);
        main.appendChild(formRow('拨杆功能', selectWrap(featureSelect)));
        leftAction = makeSelect([], '0'); rightAction = makeSelect([], '0');
        main.appendChild(formRow('左拨动作', selectWrap(leftAction)));
        main.appendChild(formRow('右拨动作', selectWrap(rightAction)));
        app.appendChild(main);
        var grid = create('div', { 'class': 'ts-grid' });
        grid.appendChild(buildProxySection(data));
        grid.appendChild(buildResetSection(data));
        app.appendChild(grid);
        featureSelect.addEventListener('change', function() { selectFeature(featureSelect.value); });
        selectFeature(activeFeature);

        var actions = create('div', { 'class': 'cbi-page-actions toggle-actions ts-save' });
        var saveOnly = create('button', { type: 'button', 'class': 'btn cbi-button cbi-button-save', text: '保存' });
        var saveApply = create('button', { type: 'button', 'class': 'btn cbi-button cbi-button-apply', text: '保存并应用' });
        saveOnly.addEventListener('click', function() { save('save_only', saveOnly); });
        saveApply.addEventListener('click', function() { save('save', saveApply); });
        actions.appendChild(saveOnly); actions.appendChild(saveApply); app.appendChild(actions);
        if (statusInterval) clearInterval(statusInterval); statusInterval = setInterval(fetchMode, 2000);
    }

    var request = new XMLHttpRequest();
    request.open('GET', apiUrl + '?_=' + Date.now(), true); request.setRequestHeader('Cache-Control', 'no-cache');
    request.onload = function() {
        var data = {};
        try { var response = JSON.parse(request.responseText); if (response.success) data = response.data || {}; } catch (e) {}
        buildUI(data);
    };
    request.onerror = function() { buildUI({}); };
    request.send();
})();
