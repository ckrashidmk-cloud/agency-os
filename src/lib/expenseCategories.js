const CUSTOM_EXPENSE_CATEGORIES_KEY = "__agency_os_custom_expense_categories__";

export const DEFAULT_EXPENSE_CATEGORIES = [
  { value: "software", label: "Software & Subscriptions" },
  { value: "ad_spend", label: "Advertising & Marketing" },
  { value: "office_supplies", label: "Office Supplies" },
  { value: "travel", label: "Travel" },
  { value: "meals_entertainment", label: "Meals & Entertainment" },
  { value: "utilities", label: "Utilities & Internet" },
  { value: "equipment", label: "Equipment" },
  { value: "contractors", label: "Contractors & Freelancers" },
  { value: "payroll", label: "Payroll & Benefits" },
  { value: "professional_services", label: "Professional Services" },
  { value: "rent", label: "Rent & Facilities" },
  { value: "insurance", label: "Insurance" },
  { value: "taxes_fees", label: "Taxes & Fees" },
  { value: "training", label: "Training & Education" },
  { value: "shipping", label: "Shipping & Delivery" },
  { value: "maintenance", label: "Repairs & Maintenance" },
  { value: "other", label: "Other" },
];

export function loadCustomExpenseCategories() {
  try {
    const stored = JSON.parse(localStorage.getItem(CUSTOM_EXPENSE_CATEGORIES_KEY) || "[]");
    return Array.isArray(stored)
      ? stored.filter((category) => typeof category === "string" && category.trim())
      : [];
  } catch (error) {
    console.error("Could not load custom expense categories:", error);
    return [];
  }
}

export function saveCustomExpenseCategories(categories) {
  localStorage.setItem(CUSTOM_EXPENSE_CATEGORIES_KEY, JSON.stringify(categories));
}

export function formatExpenseCategory(category) {
  const predefined = DEFAULT_EXPENSE_CATEGORIES.find((item) => item.value === category);
  if (predefined) return predefined.label;
  return (category || "other")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
