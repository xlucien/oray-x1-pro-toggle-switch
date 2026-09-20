include $(TOPDIR)/rules.mk

PKG_NAME:=toggle-switch
PKG_VERSION:=1.4.0
PKG_RELEASE:=3
PKG_LICENSE:=MIT
PKG_MAINTAINER:=Louis

include $(INCLUDE_DIR)/package.mk

define Package/toggle-switch
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=Oray X1 Pro 滑动开关控制
  PKGARCH:=all
  DEPENDS:=+luci-base +ucode-mod-fs +ucode-mod-uci +ucode-mod-uloop +kmod-gpio-button-hotplug
endef

define Package/toggle-switch/description
  Interrupt-driven GPIO0 toggle switch controller and LuCI panel for Oray X1 Pro.
endef

define Build/Compile
endef

define Package/toggle-switch/conffiles
/etc/config/x1pro-toggle
/etc/x1pro-toggle.d/high
/etc/x1pro-toggle.d/low
endef

define Package/toggle-switch/install
	$(INSTALL_DIR) $(1)/etc/config $(1)/etc/init.d $(1)/etc/rc.button $(1)/etc/x1pro-toggle.d
	$(INSTALL_CONF) ./etc/config/x1pro-toggle $(1)/etc/config/x1pro-toggle
	$(INSTALL_BIN) ./etc/init.d/x1pro-toggle $(1)/etc/init.d/x1pro-toggle
	$(INSTALL_BIN) ./etc/rc.button/BTN_0 $(1)/etc/rc.button/BTN_0
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./etc/uci-defaults/99-toggle-switch $(1)/etc/uci-defaults/99-toggle-switch
	$(INSTALL_DATA) ./etc/x1pro-toggle.d/high.example $(1)/etc/x1pro-toggle.d/high.example
	$(INSTALL_DATA) ./etc/x1pro-toggle.d/low.example $(1)/etc/x1pro-toggle.d/low.example
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) ./usr/sbin/x1pro-toggle-apply $(1)/usr/sbin/x1pro-toggle-apply
	$(INSTALL_BIN) ./usr/sbin/x1pro-toggle-sync $(1)/usr/sbin/x1pro-toggle-sync
	$(INSTALL_BIN) ./usr/sbin/x1pro-toggle-wifi $(1)/usr/sbin/x1pro-toggle-wifi
	$(INSTALL_BIN) ./usr/sbin/x1pro-toggle-proxy $(1)/usr/sbin/x1pro-toggle-proxy
	$(INSTALL_BIN) ./usr/sbin/x1pro-reset-control $(1)/usr/sbin/x1pro-reset-control
	$(INSTALL_DIR) $(1)/usr/libexec
	$(INSTALL_BIN) ./usr/libexec/x1pro-reset-button $(1)/usr/libexec/x1pro-reset-button
	$(INSTALL_BIN) ./usr/libexec/x1pro-delay $(1)/usr/libexec/x1pro-delay
	$(INSTALL_DIR) $(1)/usr/share/ucode/luci/controller $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./usr/share/ucode/luci/controller/toggle.uc $(1)/usr/share/ucode/luci/controller/toggle.uc
	$(INSTALL_DATA) ./usr/share/luci/menu.d/toggle-switch.json $(1)/usr/share/luci/menu.d/toggle-switch.json
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/toggle
	$(INSTALL_DATA) ./www/luci-static/resources/view/toggle/index.js $(1)/www/luci-static/resources/view/toggle/index.js
	$(INSTALL_DATA) ./www/luci-static/resources/view/toggle/index.css $(1)/www/luci-static/resources/view/toggle/index.css
endef

define Package/toggle-switch/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	/etc/init.d/x1pro-toggle enable
	uci -q get x1pro-toggle.main.reset_single_enabled >/dev/null || uci set x1pro-toggle.main.reset_single_enabled='0'
	uci -q get x1pro-toggle.main.reset_single_action >/dev/null || uci set x1pro-toggle.main.reset_single_action='wifi'
	uci -q get x1pro-toggle.main.reset_double_enabled >/dev/null || uci set x1pro-toggle.main.reset_double_enabled='0'
	uci -q get x1pro-toggle.main.reset_double_action >/dev/null || uci set x1pro-toggle.main.reset_double_action='wifi'
	uci -q get x1pro-toggle.main.reset_triple_enabled >/dev/null || uci set x1pro-toggle.main.reset_triple_enabled='0'
	uci -q get x1pro-toggle.main.reset_triple_action >/dev/null || uci set x1pro-toggle.main.reset_triple_action='reboot'
	uci -q commit x1pro-toggle
	[ -e /etc/rc.button/reset.x1pro-stock ] || cp /etc/rc.button/reset /etc/rc.button/reset.x1pro-stock
	cp /usr/libexec/x1pro-reset-button /etc/rc.button/reset
	chmod 0755 /etc/rc.button/reset
	rm -f /tmp/luci-indexcache
	rm -f /usr/lib/lua/luci/controller/toggle.lua /usr/lib/lua/luci/view/toggle/index.htm
}
exit 0
endef

define Package/toggle-switch/prerm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	[ ! -e /etc/rc.button/reset.x1pro-stock ] || cp /etc/rc.button/reset.x1pro-stock /etc/rc.button/reset
}
exit 0
endef

$(eval $(call BuildPackage,toggle-switch))
