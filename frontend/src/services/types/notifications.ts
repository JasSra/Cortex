// Typed models matching backend NotificationsController

export interface DeviceRegistrationRequest {
  endpoint: string
  p256dh: string
  auth: string
  deviceType?: string // web, mobile, desktop
  deviceName?: string
  userAgent?: string
}

export interface DeviceRegistrationResponse {
  deviceId: string
  success: boolean
  message?: string
  registeredAt: string
}

export interface RegisteredDevice {
  deviceId: string
  deviceType: string
  deviceName?: string
  registeredAt: string
  lastUsed?: string
  isActive: boolean
}

export interface TestNotificationRequest {
  title?: string
  message?: string
  type?: string
}

export interface TestNotificationResponse {
  success: boolean
  successfulDeliveries: number
  failedDeliveries: number
  deliveryMethods: string[]
  errors: string[]
  sentAt: string
}

export interface NotificationHistoryEntry {
  id: string
  type: string
  title: string
  message: string
  status: string // sent, delivered, failed, read
  deliveryMethods: string[]
  sentAt: string
  readAt?: string
}

export interface NotificationHistoryResponse {
  notifications: NotificationHistoryEntry[]
  totalCount: number
  limit: number
  offset: number
}

export interface NotificationPreferences {
  emailNotifications: boolean
  pushNotifications: boolean
  achievementNotifications: boolean
  weeklyDigest: boolean
  maintenanceAlerts: boolean
  noteReminders?: boolean
  securityAlerts?: boolean
  quietHoursStart?: string
  quietHoursEnd?: string
  timezone?: string
  emailTypes?: string[]
  pushTypes?: string[]
}
