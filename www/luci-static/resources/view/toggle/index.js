(function() {
    'use strict';

    var apiUrl = '/cgi-bin/luci/admin/system/toggle/api';
    var app, saveBtn, statusText, errorDiv, globalSwitch;
    var proxyEnable, proxyTarget, proxyStatusText, proxyDetectBtn;
    var resetControls = {};
    var statusInterval = null;

    var controls = {};

    function $(sel) { return document.querySelector(sel); }

    function create(tag, attrs, children) {
        var el = document.createElement(tag);
        if (attrs) {
            for (var k in attrs) {
                if (k === 'checked') {
                    if (attrs[k] === true) el.checked = true;
                } else if (k === 'text') {
                    el.textContent = attrs[k];
                } else {
                    el.setAttribute(k, attrs[k]);
                }
            }
        }
        if (children) {
            for (var i = 0; i < children.length; i++) {
                var c = children[i];
                if (typeof c === 'string') el.appendChild(document.createTextNode(c));
                else el.appendChild(c);
            }
        }
        return el;
    }

    function showError(msg) {
        if (errorDiv) {
            errorDiv.style.display = 'block';
            errorDiv.textContent = '❌ ' + msg;
        }
        console.error('[toggle]', msg);
    }
    function hideError() { if (errorDiv) errorDiv.style.display = 'none'; }

    function post(data, callback) {
        var bodyData = {};
        for (var k in data) bodyData[k] = data[k];
        if (typeof csrf_token !== 'undefined' && csrf_token) bodyData.token = csrf_token;
        var body = Object.keys(bodyData).map(function(k){
            return encodeURIComponent(k) + '=' + encodeURIComponent(bodyData[k]);
        }).join('&');

        var xhr = new XMLHttpRequest();
        xhr.open('POST', apiUrl, true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        if (typeof csrf_token !== 'undefined' && csrf_token) {
            xhr.setRequestHeader('X-CSRF-Token', csrf_token);
        }
        xhr.onload = function() {
            if (xhr.status === 200) {
                try { callback(JSON.parse(xhr.responseText)); }
                catch(e) { callback({success:false, error:_('Invalid response')}); }
            } else {
                callback({success:false, error:_('Request failed: ') + xhr.status});
            }
        };
        xhr.onerror = function() { callback({success:false, error:_('Network error')}); };
        xhr.send(body);
    }

    function fetchMode() {
        var xhr = new XMLHttpRequest();
        var url = apiUrl + '?brief=1&_=' + Date.now() + '&r=' + Math.random();
        xhr.open('GET', url, true);
        xhr.setRequestHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        xhr.setRequestHeader('Pragma', 'no-cache');
        xhr.onload = function() {
            if (xhr.status === 200) {
                try {
                    var resp = JSON.parse(xhr.responseText);
                    if (resp.success && resp.data) {
                        updateMode(resp.data.current_mode);
                    }
                } catch(e) {}
            }
        };
        xhr.send();
    }

    function updateMode(mode) {
        if (!statusText) return;
        var txt = (mode === '1' || mode === 1) ? _('Right') : _('Left');
        statusText.textContent = _('Current switch position:') + ' ' + txt;
    }

    function enableOnlyFeature(active) {
        if (active !== 'led' && controls.led) controls.led.enabled.checked = false;
        if (active !== 'wifi' && controls.wifi) controls.wifi.enabled.checked = false;
        if (active !== 'proxy' && proxyEnable) proxyEnable.checked = false;
    }

    // LED、WiFi、代理控制三者互斥；旧配置冲突时按代理、WiFi、LED保留一个。
    function applyMutexRules() {
        if (proxyEnable && proxyEnable.checked) enableOnlyFeature('proxy');
        else if (controls.wifi && controls.wifi.enabled.checked) enableOnlyFeature('wifi');
        else if (controls.led && controls.led.enabled.checked) enableOnlyFeature('led');
    }

    // ===== 左右互斥：左右不能同时相同 =====
    function setupOppositeMutex(prefix) {
        if (!controls[prefix]) return;
        var g = controls[prefix];

        function setLeftRight(leftIsOn) {
            g.left_on.checked = leftIsOn;
            g.left_off.checked = !leftIsOn;
            g.right_on.checked = !leftIsOn;
            g.right_off.checked = leftIsOn;
        }

        g.left_on.addEventListener('change', function() {
            if (this.checked) setLeftRight(true);
        });
        g.left_off.addEventListener('change', function() {
            if (this.checked) setLeftRight(false);
        });
        g.right_on.addEventListener('change', function() {
            if (this.checked) setLeftRight(false);
        });
        g.right_off.addEventListener('change', function() {
            if (this.checked) setLeftRight(true);
        });
    }

    function buildFunctionBlock(title, prefix, data, actionLabels) {
        var block = create('div', { 'class': 'func-block' });
        block.appendChild(create('div', { 'class': 'func-title', 'text': title }));

        var rowEnable = create('div', { 'class': 'toggle-item' });
        var labelEnable = create('span', { 'class': 'toggle-label', 'text': _('Enable') });
        var inputEnable = create('input', { 'type': 'checkbox', 'checked': data[prefix + '_enabled'] === true });
        var switchLabel = create('label', { 'class': 'toggle-switch' }, [
            inputEnable,
            create('span', { 'class': 'toggle-slider' })
        ]);
        rowEnable.appendChild(labelEnable);
        rowEnable.appendChild(switchLabel);
        block.appendChild(rowEnable);

        block.appendChild(create('div', { 'class': 'divider' }));

        var labelLeft = create('div', { 'class': 'section-label', 'text': _('Left') });
        block.appendChild(labelLeft);
        var leftVal = data[prefix + '_left_action'] === true;
        var rowLeft = createRadioRow(prefix + '_left_action', leftVal, actionLabels);
        block.appendChild(rowLeft.row);

        var labelRight = create('div', { 'class': 'section-label', 'text': _('Right') });
        block.appendChild(labelRight);
        var rightVal = data[prefix + '_right_action'] === true;
        var rowRight = createRadioRow(prefix + '_right_action', rightVal, actionLabels);
        block.appendChild(rowRight.row);

        controls[prefix] = {
            enabled: inputEnable,
            left_on: rowLeft.input_on,
            left_off: rowLeft.input_off,
            right_on: rowRight.input_on,
            right_off: rowRight.input_off
        };

        setupOppositeMutex(prefix);

        inputEnable.addEventListener('change', function() {
            if (inputEnable.checked) enableOnlyFeature(prefix);
        });

        return block;
    }

    function createRadioRow(name, onChecked, labels) {
        var row = create('div', { 'class': 'radio-row' });
        var input_on  = create('input', { 'type': 'radio', 'name': name, 'id': name + '_on',  'checked': onChecked });
        var label_on  = create('label', { 'for': name + '_on', 'text': labels[0] });
        var spacer    = create('span', { 'class': 'spacer' });
        var input_off = create('input', { 'type': 'radio', 'name': name, 'id': name + '_off', 'checked': !onChecked });
        var label_off = create('label', { 'for': name + '_off', 'text': labels[1] });
        row.appendChild(input_on);
        row.appendChild(label_on);
        row.appendChild(spacer);
        row.appendChild(input_off);
        row.appendChild(label_off);
        return { row: row, input_on: input_on, input_off: input_off };
    }

    function proxyLabel(target) {
        var labels = {
            none: '无', conflict: '检测到多个代理', passwall: 'PassWall',
            openclash: 'OpenClash', ssrplus: 'SSR Plus', nikki: 'Nikki',
            daed: 'daed', homeproxy: 'HomeProxy', mihomo: 'MihomoTProxy'
        };
        return labels[target] || target;
    }

    function renderProxyStatus(status) {
        status = status || { target: 'none', state: 'not_installed' };
        var states = {
            not_installed: '未安装', installed: '已安装，未启用',
            running: '正在运行', error: '配置已启用，但启动异常',
            conflict: '检测到多个代理，请手动选择'
        };
        proxyStatusText.className = 'proxy-status status-' + status.state;
        proxyStatusText.textContent = '当前状态：' +
            (status.target === 'none' ? '' : proxyLabel(status.target) + ' · ') +
            (states[status.state] || status.state);
    }

    function buildProxyPane(data) {
        var pane = create('div', { 'class': 'control-section', 'id': 'proxy-pane' });
        var card = create('div', { 'class': 'proxy-card' });
        card.appendChild(create('div', { 'class': 'func-title', 'text': '🌐 代理控制' }));

        var enableRow = create('div', { 'class': 'toggle-item proxy-row' });
        enableRow.appendChild(create('span', { 'class': 'toggle-label', 'text': '启用代理拨杆控制' }));
        proxyEnable = create('input', { 'type': 'checkbox', 'checked': data.proxy_enabled === true });
        proxyEnable.addEventListener('change', function() {
            if (proxyEnable.checked) enableOnlyFeature('proxy');
        });
        enableRow.appendChild(create('label', { 'class': 'toggle-switch' }, [proxyEnable, create('span', { 'class': 'toggle-slider' })]));
        card.appendChild(enableRow);

        var selectRow = create('div', { 'class': 'proxy-field' });
        selectRow.appendChild(create('label', { 'text': '代理选择' }));
        proxyTarget = create('select', { 'class': 'proxy-select' });
        var choices = [
            ['auto', '自动检测'], ['passwall', 'PassWall'], ['openclash', 'OpenClash'],
            ['ssrplus', 'SSR Plus'], ['nikki', 'Nikki'], ['daed', 'daed'],
            ['homeproxy', 'HomeProxy'], ['mihomo', 'MihomoTProxy']
        ];
        choices.forEach(function(item) {
            var option = create('option', { 'value': item[0], 'text': item[1] });
            if ((data.proxy_target || 'auto') === item[0]) option.selected = true;
            proxyTarget.appendChild(option);
        });
        selectRow.appendChild(proxyTarget);
        card.appendChild(selectRow);

        var actions = create('div', { 'class': 'proxy-actions' });
        actions.appendChild(create('div', { 'class': 'proxy-action', 'text': '⬅ 左拨：关闭代理' }));
        actions.appendChild(create('div', { 'class': 'proxy-action', 'text': '➡ 右拨：恢复代理' }));
        card.appendChild(actions);

        proxyStatusText = create('div', { 'class': 'proxy-status' });
        card.appendChild(proxyStatusText);
        renderProxyStatus(data.proxy_status);

        proxyDetectBtn = create('button', { 'class': 'btn-detect', 'text': '重新检测' });
        proxyDetectBtn.addEventListener('click', function() {
            proxyDetectBtn.disabled = true;
            post({ action: 'detect_proxy', proxy_target: proxyTarget.value }, function(resp) {
                proxyDetectBtn.disabled = false;
                if (resp.success) renderProxyStatus(resp.proxy_status);
                else showError(resp.error || '检测失败');
            });
        });
        card.appendChild(proxyDetectBtn);
        pane.appendChild(card);
        return pane;
    }

    function resetActionLabel(value) {
        return { wifi: '切换 WiFi', led: '切换灯光', reboot: '重启' }[value] || value;
    }

    function buildResetActionRow(gesture, title, data) {
        var row = create('div', { 'class': 'reset-action-row' });
        var head = create('div', { 'class': 'reset-action-head' });
        head.appendChild(create('strong', { 'text': title }));
        var enabled = create('input', { 'type': 'checkbox', 'checked': data['reset_' + gesture + '_enabled'] === true });
        head.appendChild(create('label', { 'class': 'toggle-switch' }, [enabled, create('span', { 'class': 'toggle-slider' })]));
        row.appendChild(head);
        var select = create('select', { 'class': 'proxy-select' });
        [['wifi', '切换 WiFi'], ['led', '切换灯光'], ['reboot', '重启']].forEach(function(item) {
            var option = create('option', { 'value': item[0], 'text': item[1] });
            if (data['reset_' + gesture + '_action'] === item[0]) option.selected = true;
            select.appendChild(option);
        });
        row.appendChild(select);
        resetControls[gesture] = { enabled: enabled, action: select };
        return row;
    }

    function buildResetPane(data) {
        var pane = create('div', { 'class': 'control-section', 'id': 'reset-pane' });
        var card = create('div', { 'class': 'proxy-card reset-card' });
        card.appendChild(create('div', { 'class': 'func-title', 'text': '⏻ RESET 控制' }));
        card.appendChild(create('div', { 'class': 'reset-note', 'text': 'RESET 按键控制独立运行，不受总开关影响。连击判定时间为 1200 毫秒。' }));
        card.appendChild(buildResetActionRow('single', '单击', data));
        card.appendChild(buildResetActionRow('double', '双击', data));
        card.appendChild(buildResetActionRow('triple', '三击', data));

        var longRow = create('div', { 'class': 'reset-long-row' });
        longRow.appendChild(create('strong', { 'text': '长按 5 秒' }));
        longRow.appendChild(create('span', { 'class': 'reset-protected', 'text': '始终启用 · 恢复出厂设置' }));
        card.appendChild(longRow);

        var recent = data.reset_status || {};
        var recentText = '最近动作：暂无';
        if (recent.gesture && recent.gesture !== 'none') {
            recentText = '最近动作：' + recent.gesture + ' · ' + resetActionLabel(recent.action) + ' · ' + recent.result;
            if (recent.time) recentText += ' · ' + recent.time;
        }
        card.appendChild(create('div', { 'class': 'reset-recent', 'text': recentText }));
        pane.appendChild(card);
        return pane;
    }

    function syncControlsFromData(data) {
        if (globalSwitch) {
            globalSwitch.checked = data.global_enabled === true;
        }
        for (var prefix in controls) {
            if (controls.hasOwnProperty(prefix)) {
                var group = controls[prefix];
                group.enabled.checked = data[prefix + '_enabled'] === true;
                var leftChecked = data[prefix + '_left_action'] === true;
                var rightChecked = data[prefix + '_right_action'] === true;
                group.left_on.checked = leftChecked;
                group.left_off.checked = !leftChecked;
                group.right_on.checked = rightChecked;
                group.right_off.checked = !rightChecked;
            }
        }
        applyMutexRules();
    }

    function syncControlsFromPost(postData) {
        if (globalSwitch) {
            globalSwitch.checked = postData.global_enabled === '1';
        }
        for (var prefix in controls) {
            if (controls.hasOwnProperty(prefix)) {
                var group = controls[prefix];
                var enabled = postData[prefix + '_enabled'] === '1';
                var left = postData[prefix + '_left_action'] === '1';
                var right = postData[prefix + '_right_action'] === '1';
                group.enabled.checked = enabled;
                group.left_on.checked = left;
                group.left_off.checked = !left;
                group.right_on.checked = right;
                group.right_off.checked = !right;
            }
        }
        applyMutexRules();
    }

    function buildUI(data) {
        data = data || {};
        app = $('#toggle-app');
        if (!app) return;

        if (statusInterval) {
            clearInterval(statusInterval);
            statusInterval = null;
        }

        errorDiv = document.getElementById('toggle-error');
        hideError();
        app.innerHTML = '';

        var modeTxt = (data.current_mode === '1' || data.current_mode === 1) ? _('Right') : _('Left');
        statusText = create('div', { 'class': 'current-mode', 'text': _('Current switch position:') + ' ' + modeTxt });
        app.appendChild(statusText);

        var globalBox = create('div', { 'class': 'global-box' });
        var rowGlobal = create('div', { 'class': 'toggle-item' });
        var labelGlobal = create('span', { 'class': 'toggle-label', 'text': _('Global Enable') });
        globalSwitch = create('input', { 'type': 'checkbox', 'checked': data.global_enabled === true });
        var switchLabel = create('label', { 'class': 'toggle-switch' }, [
            globalSwitch,
            create('span', { 'class': 'toggle-slider' })
        ]);
        rowGlobal.appendChild(labelGlobal);
        rowGlobal.appendChild(switchLabel);
        globalBox.appendChild(rowGlobal);
        app.appendChild(globalBox);

        app.appendChild(create('div', { 'class': 'group-heading', 'text': 'GPIO0 拨杆控制（LED / WiFi / 代理三选一）' }));
        var basicPane = create('div', { 'class': 'control-section', 'id': 'basic-pane' });
        var gridBox = create('div', { 'class': 'grid-box' });

        var blocks = [
            { title: '🔦 ' + _('LED'), prefix: 'led', labels: [_('ON'), _('OFF')] },
            { title: '📶 ' + _('WiFi'), prefix: 'wifi', labels: [_('ON'), _('OFF')] }
        ];

        for (var i = 0; i < blocks.length; i++) {
            var block = buildFunctionBlock(blocks[i].title, blocks[i].prefix, data, blocks[i].labels);
            gridBox.appendChild(block);
        }

        basicPane.appendChild(gridBox);
        app.appendChild(basicPane);
        app.appendChild(buildProxyPane(data));
        app.appendChild(create('div', { 'class': 'group-heading reset-heading', 'text': 'RESET 按键控制（独立运行）' }));
        app.appendChild(buildResetPane(data));

        var btnBox = create('div', { 'class': 'btn-box' });
        saveBtn = create('button', { 'class': 'btn-save', 'text': _('Save & Apply') });
        saveBtn.addEventListener('click', function() {
            hideError();
            saveBtn.disabled = true;
            var origText = saveBtn.textContent;
            saveBtn.textContent = _('Saving...');

            var postData = { action: 'save' };
            postData['global_enabled'] = globalSwitch.checked ? '1' : '0';
            postData['proxy_enabled'] = proxyEnable.checked ? '1' : '0';
            postData['proxy_target'] = proxyTarget.value;
            postData['proxy_left_action'] = '0';
            postData['proxy_right_action'] = '1';
            ['single', 'double', 'triple'].forEach(function(gesture) {
                postData['reset_' + gesture + '_enabled'] = resetControls[gesture].enabled.checked ? '1' : '0';
                postData['reset_' + gesture + '_action'] = resetControls[gesture].action.value;
            });
            for (var prefix in controls) {
                if (controls.hasOwnProperty(prefix)) {
                    var group = controls[prefix];
                    postData[prefix + '_enabled'] = group.enabled.checked ? '1' : '0';
                    postData[prefix + '_left_action'] = group.left_on.checked ? '1' : '0';
                    postData[prefix + '_right_action'] = group.right_on.checked ? '1' : '0';
                }
            }

            console.log('[toggle] Sending data:', postData);

            post(postData, function(resp) {
                saveBtn.disabled = false;
                if (resp.success) {
                    saveBtn.textContent = _('Saved');
                    setTimeout(function() { saveBtn.textContent = origText; }, 1500);
                    syncControlsFromPost(postData);
                    if (resp.proxy_status) renderProxyStatus(resp.proxy_status);
                } else {
                    showError(resp.error || _('Unknown error'));
                    saveBtn.textContent = _('Save failed');
                    setTimeout(function() { saveBtn.textContent = origText; }, 3000);
                }
            });
        });
        btnBox.appendChild(saveBtn);
        app.appendChild(btnBox);

        syncControlsFromData(data);
        statusInterval = setInterval(fetchMode, 2000);
    }

    var xhr = new XMLHttpRequest();
    xhr.open('GET', apiUrl + '?_=' + Date.now(), true);
    xhr.setRequestHeader('Cache-Control', 'no-cache');
    xhr.onload = function() {
        var data = {};
        if (xhr.status === 200) {
            try {
                var resp = JSON.parse(xhr.responseText);
                if (resp.success) data = resp.data;
            } catch(e) {}
        }
        console.log('[toggle] init data:', data);
        buildUI(data);
    };
    xhr.onerror = function() { buildUI({}); };
    xhr.send();
})();
