// Service for notification management
import { 
  CortexApiClient, 
  NotificationPreferences, 
  DeviceRegistrationRequest, 
  TestNotificationRequest 
} from '../api/cortex-api-client'

export class NotificationService {
  constructor(private client: CortexApiClient) {}

  // Device Management
  async registerDevice(request: DeviceRegistrationRequest) {
    return await this.client.registerDevicePOST(request)
  }

  async unregisterDevice(deviceId: string) {
    return await this.client.registerDeviceDELETE(deviceId)
  }

  async getRegisteredDevices() {
    return await this.client.devices()
  }

  // Notification Preferences
  async getPreferences() {
    return await this.client.preferencesGET()
  }

  async updatePreferences(preferences: NotificationPreferences) {
    return await this.client.preferencesPUT(preferences)
  }

  // Notification History
  async getHistory(limit = 50, offset = 0) {
    return await this.client.history(limit, offset)
  }

  // Test & Weekly Digest
  async sendTestNotification(request?: TestNotificationRequest) {
    return await this.client.test(request)
  }

  async triggerWeeklyDigest() {
    return await this.client.weeklyDigest()
  }

  // Push Notification Registration Helper
  async registerPushNotifications() {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      try {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: this.urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '') as BufferSource
        })

        const deviceInfo = new DeviceRegistrationRequest({
          endpoint: subscription.endpoint,
          p256dh: this.arrayBufferToBase64(subscription.getKey('p256dh')!),
          auth: this.arrayBufferToBase64(subscription.getKey('auth')!),
          deviceType: 'web',
          deviceName: `${navigator.platform} - ${navigator.userAgent.split(' ')[0]}`,
          userAgent: navigator.userAgent
        })

        return await this.registerDevice(deviceInfo)
      } catch (error) {
        console.error('Failed to register push notifications:', error)
        throw error
      }
    }
    throw new Error('Push notifications not supported')
  }

  // Helper methods for push notification setup
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/')

    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    bytes.forEach(byte => binary += String.fromCharCode(byte))
    return window.btoa(binary)
  }
}
