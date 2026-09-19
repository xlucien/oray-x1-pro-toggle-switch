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
cp "$BASE/etc/init.d/x1pro-toggle" /etc/init.d/x1pro-toggle
cp "$BASE/etc/rc.button/BTN_0" /etc/rc.button/BTN_0
chmod 0755 /usr/sbin/x1pro-toggle-apply /usr/sbin/x1pro-toggle-sync /usr/sbin/x1pro-toggle-wifi /usr/sbin/x1pro-toggle-proxy \
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

for example in high.example low.example; do
	if [ ! -e "/etc/x1pro-toggle.d/$example" ]; then
		cp "$BASE/etc/x1pro-toggle.d/$example" "/etc/x1pro-toggle.d/$example"
		chmod 0644 "/etc/x1pro-toggle.d/$example"
	fi
done

/etc/init.d/x1pro-toggle enable
/etc/init.d/x1pro-toggle restart
rm -f /tmp/luci-indexcache

echo 'Installed. Actions are disabled by default.'
echo 'This package needs the supplied gpio-keys DTS definition in the firmware.'
echo 'Watch events with: logread -f -e x1pro-toggle'
