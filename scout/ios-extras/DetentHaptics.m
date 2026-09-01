// Capacitor plugin registration for DetentHaptics (see DetentHaptics.swift).
#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(DetentHapticsPlugin, "DetentHaptics",
  CAP_PLUGIN_METHOD(tick, CAPPluginReturnPromise);
)
