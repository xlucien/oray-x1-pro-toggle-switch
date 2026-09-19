include $(TOPDIR)/rules.mk

PKG_NAME:=toggle-switch
PKG_VERSION:=1.2.0
PKG_RELEASE:=1
PKG_LICENSE:=MIT
PKG_MAINTAINER:=Louis

include $(INCLUDE_DIR)/package.mk

define Package/toggle-switch
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=Toggle Switch for Oray X1 Pro
  PKGARCH:=all
  DEPENDS:=+luci-compat +lua +kmod-gpio-button-hotplug
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
	$(INSTALL_DATA) ./etc/x1pro-toggle.d/high.example $(1)/etc/x1pro-toggle.d/high.example
	$(INSTALL_DATA) ./etc/x1pro-toggle.d/low.example $(1)/etc/x1pro-toggle.d/low.example
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) ./usr/sbin/x1pro-toggle-apply $(1)/usr/sbin/x1pro-toggle-apply
	$(INSTALL_BIN) ./usr/sbin/x1pro-toggle-sync $(1)/usr/sbin/x1pro-toggle-sync
	$(INSTALL_BIN) ./usr/sbin/x1pro-toggle-wifi $(1)/usr/sbin/x1pro-toggle-wifi
	$(INSTALL_BIN) ./usr/sbin/x1pro-toggle-proxy $(1)/usr/sbin/x1pro-toggle-proxy
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/controller $(1)/usr/lib/lua/luci/view/toggle
	$(INSTALL_DATA) ./usr/lib/lua/luci/controller/toggle.lua $(1)/usr/lib/lua/luci/controller/toggle.lua
	$(INSTALL_DATA) ./usr/lib/lua/luci/view/toggle/index.htm $(1)/usr/lib/lua/luci/view/toggle/index.htm
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/toggle
	$(INSTALL_DATA) ./www/luci-static/resources/view/toggle/index.js $(1)/www/luci-static/resources/view/toggle/index.js
	$(INSTALL_DATA) ./www/luci-static/resources/view/toggle/index.css $(1)/www/luci-static/resources/view/toggle/index.css
endef

define Package/toggle-switch/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	/etc/init.d/x1pro-toggle enable
	rm -f /tmp/luci-indexcache
}
exit 0
endef

$(eval $(call BuildPackage,toggle-switch))
