export function describeNewTrafficPeriod(preview, t, locale) {
  if (!preview?.eligible || !preview.new_expires_at) return '';
  const minutes = Math.ceil(preview.deduct_seconds / 60);
  const expiry = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium', timeStyle: 'short'
  }).format(new Date(preview.new_expires_at * 1000));
  return t('dashboard.newPeriodPreview', {
    days: Math.floor(minutes / 1440),
    hours: Math.floor(minutes % 1440 / 60),
    minutes: minutes % 60,
    expiry
  });
}
