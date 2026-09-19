# toggle-switch：Oray X1 Pro GPIO0 拨动开关

适用于 ImmortalWrt/OpenWrt 的中断驱动拨动开关组件，包含 LuCI 面板、UCI 配置和安装脚本。

## Wi‑Fi 状态切换

LuCI 中提供独立的 WiFi 功能模块，默认映射为左拨关闭、右拨开启。这里的“开启”不是强制打开全部 radio，而是恢复启用模块时保存的状态：

- WiFi 模块从关闭切换为开启时，仅保存每个 `wifi-device` 的 `disabled` 状态。
- 左拨（GPIO0 高电平）将所有 radio 设为关闭并执行 `wifi reload`。
- 右拨（GPIO0 低电平）恢复保存的各 radio 状态并执行 `wifi reload`。
- 重复保存 LuCI 配置不会覆盖快照，避免在 Wi‑Fi 已被左拨关闭时把“全关闭”误存为原始状态。
- 在 LuCI 中关闭 WiFi 模块时会先恢复快照，防止退出控制后 Wi‑Fi 意外保持关闭。
- 快照不包含 SSID、密钥、信道或其他无线参数。

快照保存在 `/etc/config/x1pro-toggle` 的 `wifi_state` section 中。模块默认关闭，安装或升级不会改变当前 Wi‑Fi 状态。

## 代理控制

LuCI 的“代理控制”选项卡支持自动检测、PassWall、OpenClash、SSR Plus、Nikki、daed、HomeProxy 和 MihomoTProxy。启用模块时保存所选代理的配置与运行状态；左拨停止代理，右拨恢复快照。自动检测按“正在运行 → 配置启用 → 已安装”选择唯一候选，发现多个候选时报告冲突并要求手动选择。

检测只在打开页面、点击“重新检测”或拨杆状态变化时执行，没有常驻轮询。状态分为未安装、已安装未启用、正在运行、配置已启用但启动异常和多代理冲突。脚本只修改所选代理自身的启用项并调用其 init 服务，不改动通用 network、wireless 配置。

## RESET 多击控制

RESET 控制独立于 GPIO0 拨杆的总开关。连击窗口为 1200 毫秒，单击与双击默认关闭，三击默认执行重启；长按 5 秒始终保留系统恢复出厂功能。单击、双击、三击均可分别启用并选择切换 WiFi、切换灯光或重启。四击及以上只记录日志，不执行动作。

RESET 的 WiFi 切换使用独立的 `reset_wifi_state` 快照：关闭前保存各 radio 状态，再次切换时恢复；没有快照时不会强制打开全部 radio。安装会把原始脚本备份为 `/etc/rc.button/reset.x1pro-stock`。保存 LuCI 配置会清除尚未结算的连击，长按达到 5 秒也会取消全部短按动作。

## 结论

本方案不运行轮询守护进程。GPIO0 在 DTS 中注册为 `gpio-keys` 的 `EV_SW`，由内核监听上升沿和下降沿；状态改变时，`gpio-button-hotplug` 产生 `pressed`/`released` 事件，procd 根据 `/etc/hotplug.json` 调用 `/etc/rc.button/BTN_0`。

只有拨动开关时才启动一个很短的 shell 进程。开机时另做一次状态同步，完成后立即退出。常态没有 Lua 或 shell 轮询进程。

## 对原 GL-MT3600BE 固件的取证结果

- 固件：ImmortalWrt `25.12-SNAPSHOT r0+38463-1b6fa75ca0`，`mediatek/filogic`，`aarch64_cortex-a53`。
- SHA-256：`A80F0DD7AFC9402084B1245B50A6AC4B501DB9CCF6B6C870ACEB224095949706`。
- sysupgrade 内含 FIT kernel 和 XZ SquashFS rootfs。
- DTB 的开关节点是 `/gpio-keys/button-mode`：

```dts
button-mode {
        label = "mode";
        linux,code = <0x100>;       /* BTN_0 */
        linux,input-type = <0x5>;  /* EV_SW */
        gpios = <&pio 3 GPIO_ACTIVE_HIGH>;
        debounce-interval = <10>;
};
```

- 原定制功能由 `/etc/init.d/toggle-monitor` 通过 procd 启动 `/usr/bin/toggle-monitor.lua`；脚本每秒读取一次 GPIO，不是 hotplug 事件处理。
- 脚本先从 debugfs 查找标签 `mode` 对应的 GPIO，再尝试 legacy sysfs；GPIO 被 `gpio-keys` 占用时最终仍从 `/sys/kernel/debug/gpio` 读取。
- 原固件电平映射明确为：物理高电平 → `mode=0` → LuCI 显示 `Left`；物理低电平 → `mode=1` → 显示 `Right`。
- 原 UCI 默认动作：Left/高电平为 LED 开、PassWall 开、OpenClash 关、SSR Plus 开；Right/低电平相反。但 `global_enabled` 及所有功能开关默认均为 `0`，所以默认只记录状态，不执行动作。
- LuCI 路径是 `系统 → Toggle Switch`，后端 `/usr/lib/lua/luci/controller/toggle.lua`，配置为 `/etc/config/toggle`。保存后调用 `toggle-monitor.lua --apply`。
- `/etc/init.d/gpio_switch` 是 OpenWrt 通用的 GPIO 输出初始化服务，读取 `/etc/config/system` 的 `gpio_switch` section；与这个 GPIO 输入拨动开关不是同一条控制链。
- 固件含 `kmod-gpio-button-hotplug`，`/etc/hotplug.json` 也会将按钮事件转发到 `/etc/rc.button/%BUTTON%`。原定制包没有利用现成事件，而是另加了轮询服务。

## X1 Pro 实机确认

已通过 SSH 检查实际设备 `oray,x1-pro`（ImmortalWrt mediatek/filogic）：运行中的 DTB 已经包含 `/gpio-keys/mode`，无需修改或重刷 DTB。实际节点等价于：

```dts
mode {
        label = "mode";
        linux,code = <BTN_0>;
        linux,input-type = <EV_SW>;
        gpios = <&pio 0 GPIO_ACTIVE_LOW>;
        debounce-interval = <60>;
};
```

实机也已加载：

```text
kmod-gpio-button-hotplug
```

debugfs 将该引脚显示为 `gpio-512`，这是控制器全局基址 512 加偏移 0；它仍然是用户确认的 GPIO0。状态为输入、IRQ、`ACTIVE LOW`。`EV_SW` 会让 OpenWrt 驱动在 probe 时发送一次初始状态事件，之后由 GPIO 双边沿 IRQ 触发，不需要周期轮询。

## 文件安装位置

```text
/etc/config/x1pro-toggle
/etc/init.d/x1pro-toggle
/etc/rc.button/BTN_0
/etc/x1pro-toggle.d/high.example
/etc/x1pro-toggle.d/low.example
/usr/sbin/x1pro-toggle-apply
/usr/sbin/x1pro-toggle-sync
/usr/sbin/x1pro-toggle-proxy
/usr/sbin/x1pro-reset-control
/usr/libexec/x1pro-reset-button
/etc/rc.button/reset.x1pro-stock
```

把本目录上传到路由器，例如 `/tmp/x1pro-gpio0-toggle`，然后：

```sh
cd /tmp/x1pro-gpio0-toggle
sh install.sh
```

安装脚本设置脚本权限为 `0755`、UCI 配置为 `0600`，启用一次性启动同步。它不启动常驻进程。

## 高低电平动作

X1 Pro 实机 DTS 使用 `GPIO_ACTIVE_LOW`，处理脚本仍按物理高低电平命名：

| GPIO0 物理电平 | hotplug ACTION | 采用的配置 | 沿用 GL-MT3600BE 语义 |
|---|---|---|---|
| 高 `1` | `released` | `*_high_action` | Left |
| 低 `0` | `pressed` | `*_low_action` | Right |

所有动作默认禁用。启用自动检测的代理控制：

```sh
uci set x1pro-toggle.main.global_enabled='1'
uci set x1pro-toggle.main.proxy_enabled='1'
uci set x1pro-toggle.main.proxy_target='auto'
uci set x1pro-toggle.main.proxy_high_action='0'
uci set x1pro-toggle.main.proxy_low_action='1'
uci commit x1pro-toggle
/usr/sbin/x1pro-toggle-proxy snapshot
/etc/init.d/x1pro-toggle reload
```

也可把 `proxy_target` 改为 `passwall`、`openclash`、`ssrplus`、`nikki`、`daed`、`homeproxy` 或 `mihomo`。这表示 GPIO0 高电平关闭所选代理，低电平恢复启用模块时保存的状态。

如需自定义动作，把示例复制为可执行 hook：

```sh
cp /etc/x1pro-toggle.d/high.example /etc/x1pro-toggle.d/high
cp /etc/x1pro-toggle.d/low.example /etc/x1pro-toggle.d/low
chmod 0755 /etc/x1pro-toggle.d/high /etc/x1pro-toggle.d/low
```

## 现场确认方向与事件

先保持所有动作禁用，观察日志：

```sh
uci set x1pro-toggle.main.global_enabled='0'
uci commit x1pro-toggle
logread -f -e x1pro-toggle
```

拨动一次，应分别看到：

```text
GPIO0=1 (high)
GPIO0=0 (low)
```

也可直接查看物理电平：

```sh
mount -t debugfs debugfs /sys/kernel/debug 2>/dev/null
grep '|mode' /sys/kernel/debug/gpio
```

如果 X1 Pro 实物左右方向与 GL-MT3600BE 相反，不必改网络配置或驱动，只交换所启用功能的 `high_action` 与 `low_action` 值即可。

检查内核事件链：

```sh
logread -f | grep -E 'BTN_0|x1pro-toggle'
```

若拨动时完全没有事件：

```sh
lsmod | grep gpio_button_hotplug
dmesg | grep -Ei 'gpio|button|BTN_0'
grep -R . /proc/device-tree/keys/mode 2>/dev/null
```

重点检查 DTS 是否进了实际运行的 DTB、GPIO0 是否被别的节点占用，以及 `kmod-gpio-button-hotplug` 是否已加载。
