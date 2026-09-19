#!/bin/sh
set -eu

[ "$(id -u)" = '0' ] || { echo 'Please run as root.' >&2; exit 1; }

BASE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

mkdir -p /usr/sbin /etc/init.d /etc/config /etc/rc.button /etc/x1pro-toggle.d \
	/usr/lib/lua/luci/controller /usr/lib/lua/luci/view/toggle \
	/www/luci-static/resources/view/toggle
cp "$BASE/usr/sbin/x1pro-toggle-apply" /usr/sbin/x1pro-toggle-apply
cp "$BASE/usr/sbin/x1pro-toggle-sync" /usr/sbin/x1pro-toggle-sync
cp "$BASE/usr/sbin/x1pro-toggle-wifi" /usr/sbin/x1pro-toggle-wifi
cp "$BASE/usr/sbin/x1pro-toggle-proxy" /usr/sbin/x1pro-toggle-proxy
cp "$BASE/usr/sbin/x1pro-reset-control" /usr/sbin/x1pro-reset-control
mkdir -p /usr/libexec
cp "$BASE/usr/libexec/x1pro-reset-button" /usr/libexec/x1pro-reset-button
cp "$BASE/etc/init.d/x1pro-toggle" /etc/init.d/x1pro-toggle
cp "$BASE/etc/rc.button/BTN_0" /etc/rc.button/BTN_0
chmod 0755 /usr/sbin/x1pro-toggle-apply /usr/sbin/x1pro-toggle-sync /usr/sbin/x1pro-toggle-wifi /usr/sbin/x1pro-toggle-proxy /usr/sbin/x1pro-reset-control /usr/libexec/x1pro-reset-button \
	/etc/init.d/x1pro-toggle /etc/rc.button/BTN_0
cp "$BASE/usr/lib/lua/luci/controller/toggle.lua" /usr/lib/lua/luci/controller/toggle.lua
cp "$BASE/usr/lib/lua/luci/view/toggle/index.htm" /usr/lib/lua/luci/view/toggle/index.htm
cp "$BASE/www/luci-static/resources/view/toggle/index.js" /www/luci-static/resources/view/toggle/index.js
cp "$BASE/www/luci-static/resources/view/toggle/index.css" /www/luci-static/resources/view/toggle/index.css
chmod 0644 /usr/lib/lua/luci/controller/toggle.lua /usr/lib/lua/luci/view/toggle/index.htm \
	/www/luci-static/resources/view/toggle/index.js /www/luci-static/resources/view/toggle/index.css

if [ ! -e /etc/config/x1pro-toggle ]; then
	cp "$BASE/etc/config/x1pro-toggle" /etc/config/x1pro-toggle
	chmod 0600 /etc/config/x1pro-toggle
else
	echo 'Keeping existing /etc/config/x1pro-toggle'
fi

uci -q get x1pro-toggle.main.reset_single_enabled >/dev/null || uci set x1pro-toggle.main.reset_single_enabled='0'
uci -q get x1pro-toggle.main.reset_single_action >/dev/null || uci set x1pro-toggle.main.reset_single_action='wifi'
uci -q get x1pro-toggle.main.reset_double_enabled >/dev/null || uci set x1pro-toggle.main.reset_double_enabled='0'
uci -q get x1pro-toggle.main.reset_double_action >/dev/null || uci set x1pro-toggle.main.reset_double_action='led'
uci -q get x1pro-toggle.main.reset_triple_enabled >/dev/null || uci set x1pro-toggle.main.reset_triple_enabled='1'
uci -q get x1pro-toggle.main.reset_triple_action >/dev/null || uci set x1pro-toggle.main.reset_triple_action='reboot'
uci -q commit x1pro-toggle

for example in high.example low.example; do
	if [ ! -e "/etc/x1pro-toggle.d/$example" ]; then
		cp "$BASE/etc/x1pro-toggle.d/$example" "/etc/x1pro-toggle.d/$example"
		chmod 0644 "/etc/x1pro-toggle.d/$example"
	fi
done

/etc/init.d/x1pro-toggle enable
/etc/init.d/x1pro-toggle restart
[ -e /etc/rc.button/reset.x1pro-stock ] || cp /etc/rc.button/reset /etc/rc.button/reset.x1pro-stock
cp /usr/libexec/x1pro-reset-button /etc/rc.button/reset
chmod 0755 /etc/rc.button/reset
rm -f /tmp/luci-indexcache

echo 'Installed. Actions are disabled by default.'
echo 'This package needs the supplied gpio-keys DTS definition in the firmware.'
echo 'Watch events with: logread -f -e x1pro-toggle'
