// English / Bangla UI strings. t('key') returns the string in the current language.
const STRINGS = {
  app_name: ['Shop Manager', 'দোকান ব্যবস্থাপনা'],
  login: ['Log in', 'লগ ইন'], logout: ['Log out', 'লগ আউট'],
  username: ['Username', 'ইউজারনেম'], password: ['Password', 'পাসওয়ার্ড'],
  dashboard: ['Dashboard', 'ড্যাশবোর্ড'], pos: ['New Sale', 'নতুন বিক্রয়'], inventory: ['Inventory', 'মজুদ'],
  categories: ['Brands & Categories', 'ব্র্যান্ড ও ক্যাটাগরি'], customers: ['Customers & Dues', 'গ্রাহক ও বাকি'],
  sales: ['Sales History', 'বিক্রয় ইতিহাস'], reports: ['Reports', 'রিপোর্ট'], settings: ['Settings', 'সেটিংস'],
  online: ['Online', 'অনলাইন'], offline: ['Offline', 'অফলাইন'], pending_sync: ['waiting to sync', 'সিঙ্ক বাকি'],
  sync_now: ['Sync now', 'এখন সিঙ্ক করুন'],
  search_product: ['Search product by name, ID or code', 'নাম, আইডি বা কোড দিয়ে পণ্য খুঁজুন'],
  qty: ['Qty', 'পরিমাণ'], discount: ['Discount', 'ছাড়'], add_to_cart: ['Add to Cart', 'কার্টে যোগ করুন'],
  cart: ['Cart', 'কার্ট'], cart_empty: ['Cart is empty', 'কার্ট খালি'],
  product: ['Product', 'পণ্য'], unit_price: ['Unit price', 'একক মূল্য'], line_total: ['Line total', 'মোট'],
  subtotal: ['Subtotal', 'উপমোট'], grand_total: ['Grand Total', 'সর্বমোট'],
  customer: ['Customer', 'গ্রাহক'], customer_name: ['Customer name', 'গ্রাহকের নাম'], address: ['Address', 'ঠিকানা'],
  phone: ['Phone number', 'ফোন নম্বর'], payment_type: ['Payment type', 'পেমেন্টের ধরন'],
  cash: ['Cash', 'নগদ'], credit: ['Credit (partial / due)', 'বাকি (আংশিক)'], amount_paid: ['Amount paid', 'পরিশোধিত'],
  change: ['Change to return', 'ফেরত দিন'], outstanding: ['Outstanding balance', 'বকেয়া'],
  confirm_sale: ['Confirm Sale', 'বিক্রয় নিশ্চিত করুন'], payment_mode: ['Payment mode', 'পেমেন্ট মাধ্যম'],
  in_stock: ['in stock', 'মজুদ'], existing_due: ['Existing due', 'আগের বাকি'],
  discount_hint: ['e.g. 500 or 10%', 'যেমন ৫০০ বা ১০%'],
  invoice: ['Invoice', 'চালান'], invoice_no: ['Invoice No.', 'চালান নং'], date_time: ['Date & time', 'তারিখ ও সময়'],
  print: ['Print', 'প্রিন্ট'], new_sale: ['New sale', 'নতুন বিক্রয়'], salesperson: ['Salesperson', 'বিক্রয়কর্মী'],
  provisional: ['Provisional — saved offline, will sync', 'অস্থায়ী — অফলাইনে সংরক্ষিত, পরে সিঙ্ক হবে'],
  thanks: ['Thank you for shopping with us!', 'আমাদের সাথে কেনাকাটার জন্য ধন্যবাদ!'],
  add_product: ['Add product', 'পণ্য যোগ করুন'], edit: ['Edit', 'সম্পাদনা'], save: ['Save', 'সংরক্ষণ'], cancel: ['Cancel', 'বাতিল'],
  delete: ['Delete', 'মুছুন'], deactivate: ['Deactivate', 'নিষ্ক্রিয়'], activate: ['Activate', 'সক্রিয়'],
  name: ['Name', 'নাম'], product_name: ['Product name', 'পণ্যের নাম'], brand: ['Brand', 'ব্র্যান্ড'], category: ['Category', 'ক্যাটাগরি'],
  id: ['ID', 'আইডি'], stock: ['Stock', 'মজুদ'], stock_qty: ['Stock qty', 'মজুদ পরিমাণ'],
  purchase_price: ['Purchase price', 'ক্রয়মূল্য'], sale_price: ['Sale price', 'বিক্রয়মূল্য'], margin: ['Margin', 'মার্জিন'],
  threshold: ['Low-stock threshold', 'সর্বনিম্ন মজুদ সীমা'], low_stock: ['Low stock', 'মজুদ কম'],
  all: ['All', 'সব'], adjust_stock: ['Adjust stock', 'মজুদ সমন্বয়'], reason: ['Reason (required)', 'কারণ (আবশ্যক)'],
  restock: ['Restock (new purchase)', 'নতুন ক্রয়'], adjustment: ['Correction / damage / return', 'সংশোধন / নষ্ট / ফেরত'],
  qty_change: ['Quantity (+ add / − subtract)', 'পরিমাণ (+ যোগ / − বিয়োগ)'], history: ['History', 'ইতিহাস'],
  margin_hint: ['Default margin applied', 'ডিফল্ট মার্জিন প্রযোজ্য'],
  export_xlsx: ['Excel', 'এক্সেল'], export_csv: ['CSV', 'সিএসভি'],
  add: ['Add', 'যোগ করুন'], products: ['Products', 'পণ্য'], status: ['Status', 'অবস্থা'], active: ['Active', 'সক্রিয়'], inactive: ['Inactive', 'নিষ্ক্রিয়'],
  daily_report: ['Daily closing', 'দৈনিক হিসাব'], monthly_report: ['Monthly', 'মাসিক'],
  transactions: ['Transactions', 'লেনদেন'], gross_sales: ['Gross sales', 'মোট বিক্রয়'], cash_collected: ['Cash collected', 'নগদ আদায়'],
  credit_extended: ['Credit given', 'বাকি দেওয়া'], profit: ['Profit', 'লাভ'], discounts: ['Discounts', 'ছাড়'],
  due_collected: ['Dues collected', 'বাকি আদায়'], by_category: ['By category', 'ক্যাটাগরি অনুযায়ী'],
  revenue: ['Revenue', 'আয়'], cost_of_goods: ['Cost of goods', 'পণ্যের ক্রয়মূল্য'], gross_profit: ['Gross profit', 'মোট লাভ'],
  stock_flow: ['Stock consumed vs restocked', 'মজুদ খরচ বনাম পুনঃমজুদ'], sold: ['Sold', 'বিক্রি'], restocked: ['Restocked', 'পুনঃমজুদ'],
  written_off: ['Written off', 'বাদ'], current_stock: ['Now', 'বর্তমান'],
  credit_overview: ['Credit overview', 'বাকির হিসাব'], credit_owed: ['Credit given this month', 'এই মাসে বাকি'],
  credit_paid: ['Dues paid this month', 'এই মাসে আদায়'], credit_outstanding: ['Total still outstanding', 'মোট বকেয়া'],
  daily_breakdown: ['Day by day', 'দিনভিত্তিক'], day: ['Day', 'দিন'], date: ['Date', 'তারিখ'], month: ['Month', 'মাস'],
  record_payment: ['Record payment', 'পেমেন্ট গ্রহণ'], amount: ['Amount', 'পরিমাণ'], due: ['Due', 'বাকি'], owing_only: ['Only with dues', 'শুধু বাকিদার'],
  unpaid_invoices: ['Unpaid invoices', 'অপরিশোধিত চালান'], payments: ['Payments', 'পেমেন্ট'],
  business_profile: ['Business profile', 'ব্যবসার তথ্য'], shop_name: ['Shop name', 'দোকানের নাম'], logo: ['Logo', 'লোগো'],
  default_margin: ['Default profit margin (%)', 'ডিফল্ট লাভের হার (%)'], retention: ['Archive sales after (days)', 'আর্কাইভ সময় (দিন)'],
  users: ['Users', 'ব্যবহারকারী'], role: ['Role', 'ভূমিকা'], add_user: ['Add user', 'ব্যবহারকারী যোগ'],
  admin: ['Admin', 'অ্যাডমিন'], manager: ['Manager', 'ম্যানেজার'], salesperson_role: ['Salesperson', 'বিক্রয়কর্মী'],
  audit_log: ['Audit log', 'অডিট লগ'], action: ['Action', 'কার্যক্রম'], details: ['Details', 'বিস্তারিত'], user: ['User', 'ব্যবহারকারী'],
  change_password: ['Change my password', 'পাসওয়ার্ড পরিবর্তন'], current_password: ['Current password', 'বর্তমান পাসওয়ার্ড'],
  new_password: ['New password', 'নতুন পাসওয়ার্ড'], leave_blank: ['leave blank to keep', 'না বদলাতে খালি রাখুন'],
  saved: ['Saved', 'সংরক্ষিত হয়েছে'], today_summary: ["Today's summary", 'আজকের সারসংক্ষেপ'], view: ['View', 'দেখুন'],
  search: ['Search', 'খুঁজুন'], from: ['From', 'থেকে'], to: ['To', 'পর্যন্ত'], total: ['Total', 'মোট'], paid: ['Paid', 'পরিশোধ'],
  none: ['Nothing to show', 'কিছু নেই'], session_expired: ['Logged out after 30 minutes of inactivity', '৩০ মিনিট নিষ্ক্রিয় থাকায় লগ আউট হয়েছে'],
  confirm_delete: ['Are you sure?', 'আপনি কি নিশ্চিত?'], offline_login: ['You are offline. Log in once while online to use the POS offline.', 'আপনি অফলাইনে আছেন। অফলাইনে POS ব্যবহার করতে একবার অনলাইনে লগ ইন করুন।'],
  synced: ['offline sales synced', 'অফলাইন বিক্রয় সিঙ্ক হয়েছে'], sync_failed: ['could not sync', 'সিঙ্ক ব্যর্থ'],
  admin_only: ['Settings are available to Admin only', 'সেটিংস শুধুমাত্র অ্যাডমিনের জন্য'],
  brands: ['Brands', 'ব্র্যান্ড'], language: ['বাংলা', 'English'],
  model_code: ['Code / model / barcode', 'কোড / মডেল / বারকোড'], bill_discount: ['Discount on whole bill', 'পুরো বিলে ছাড়'],
  item_discount: ['Item discount', 'পণ্যে ছাড়'], all_categories: ['All', 'সব'], add_more: ['Tap a product to add it', 'যোগ করতে পণ্যে চাপুন'],
  checkout: ['Checkout', 'চেকআউট'], items: ['items', 'টি পণ্য'], clear: ['Clear', 'মুছুন'], out_of_stock: ['Out of stock', 'স্টক নেই'],
  vs_yesterday: ['vs yesterday', 'গতকালের তুলনায়'], this_month: ['This month', 'এই মাস'], last_30: ['Last 30 days', 'গত ৩০ দিন'],
  top_products: ['Top products', 'সেরা পণ্য'], recent_sales: ['Recent sales', 'সাম্প্রতিক বিক্রয়'], dues_total: ['Customer dues', 'গ্রাহকের বাকি'],
  customers_owing: ['customers owing', 'জন গ্রাহকের বাকি'], sales_trend: ['Sales trend', 'বিক্রয়ের ধারা'], see_all: ['See all', 'সব দেখুন'],
  demo_data: ['Demo data', 'ডেমো ডেটা'], load_demo: ['Load demo data', 'ডেমো ডেটা লোড করুন'],
  demo_hint: ['Fills an empty shop with ~40 products, 28 customers and two months of sales so you can try every screen. Only works before the first real sale.', 'খালি দোকানে ~৪০টি পণ্য, ২৮ জন গ্রাহক ও দুই মাসের বিক্রয় যোগ করে। প্রথম আসল বিক্রয়ের আগেই কেবল কাজ করে।'],
  demo_done: ['Demo data loaded', 'ডেমো ডেটা লোড হয়েছে'], demo_logins: ['Demo staff logins (shown once — note them down):', 'ডেমো স্টাফ লগইন (একবারই দেখানো হবে):'],
  offline_ref: ['Offline ref.', 'অফলাইন নং'], welcome: ['Welcome back', 'স্বাগতম'], sign_in_hint: ['Sign in to continue', 'চালিয়ে যেতে লগ ইন করুন'],
  partial_hint: ['Leave “Amount paid” empty for full payment, or enter less for a partial payment — the rest is saved as the customer’s due.', 'পুরো টাকার জন্য “পরিশোধিত” খালি রাখুন, অথবা আংশিক পরিশোধের জন্য কম লিখুন — বাকি টাকা গ্রাহকের বকেয়া হিসেবে থাকবে।'],
  cash_partial: ['Cash — partial payment', 'নগদ — আংশিক পরিশোধ'], cash_full_paid: ['Cash — paid in full', 'নগদ — সম্পূর্ণ পরিশোধ'],
  show_password: ['Show password', 'পাসওয়ার্ড দেখুন'], hide_password: ['Hide password', 'পাসওয়ার্ড লুকান'],
  set_new_password: ['Set a new password for this user', 'এই ব্যবহারকারীর নতুন পাসওয়ার্ড দিন'], pw_min: ['Password must be at least 6 characters', 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে'],
  theme: ['Theme', 'থিম'], tagline: ['Inventory & Sales', 'মজুদ ও বিক্রয়'], loading: ['Loading…', 'লোড হচ্ছে…'],
};

let LANG = 'en';
try { LANG = localStorage.getItem('lang') || 'en'; } catch {}

function t(key) {
  const s = STRINGS[key];
  return s ? s[LANG === 'bn' ? 1 : 0] : key;
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const toBn = s => String(s).replace(/\d/g, d => BN_DIGITS[d]);

// Money in BDT with thousands separators (Bangla digits in Bangla mode).
function money(n) {
  const s = (Math.round((+n || 0) * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return '৳ ' + (LANG === 'bn' ? toBn(s) : s);
}
function num(n) { return LANG === 'bn' ? toBn(n) : String(n); }

function setLang(l) {
  LANG = l;
  try { localStorage.setItem('lang', l); } catch {}
  document.documentElement.lang = l;
}
