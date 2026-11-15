// Calculates a staff member's effective hourly rate.
// Priority: manual override → auto-calc from salary → legacy rate_per_hour → 0
export function calculateHourlyRate(user) {
  if (!user) return 0;
  const data = user.data || user;
  if (data.hourly_rate_override != null && Number(data.hourly_rate_override) > 0) {
    return Number(data.hourly_rate_override);
  }
  const salary = Number(data.monthly_salary) || 0;
  const buffer = Number(data.monthly_expense_buffer) || 0;
  const hours = Number(data.total_working_hours) || 160;
  if (salary > 0 && hours > 0) {
    return (salary + buffer) / hours;
  }
  if (data.rate_per_hour != null) return Number(data.rate_per_hour);
  return 0;
}