export type User = {
  id: string;
  email: string;
  username: string;
  name: string;
  avatarUrl?: string;
  role: string;
  createdAt: string;
};

export type Donation = {
  id: string;
  userId: string;
  donorName: string;
  amount: number;
  cryptoAmount?: string;
  currency?: string;
  message?: string;
  mediaType?: string;
  mediaUrl?: string;
  status: string;
  paymentStatus: string;
  platformFee: number;
  netAmount: number;
  createdAt: string;
  paidAt?: string | null;
};

export type WalletTransaction = {
  id: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceType?: string;
  description?: string;
  createdAt: string;
};

export type WalletSummary = {
  balance: number;
  totalReceived: number;
  currency: string;
};

export type MediaItem = {
  id: string;
  donationId: string;
  mediaType: string;
  mediaUrl: string;
  status: string;
  duration: number;
  createdAt: string;
};

export type StreamSetting = {
  id: string;
  userId: string;
  streamKey: string;
  minimumDonation: number;
  defaultDuration: number;
  youtubeEnabled: boolean;
  tiktokEnabled: boolean;
  gifEnabled: boolean;
  imageEnabled: boolean;
  showDonorName: boolean;
  showMessage: boolean;
  showAmount: boolean;
  qrBgColor?: string;
  qrColor?: string;
};

export type PublicProfile = {
  username: string;
  name: string;
  avatarUrl?: string;
  minimumDonation: number;
};

export type WidgetConfig = {
  showDonorName: boolean;
  showMessage: boolean;
  showAmount: boolean;
  minimumDonation: number;
};

export type WidgetMedia = {
  id: string;
  donorName: string;
  amount: number;
  message: string;
  mediaType: string;
  mediaUrl: string;
  duration: number;
};
