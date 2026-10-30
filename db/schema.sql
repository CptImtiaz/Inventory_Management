-- Inventory & Sales Management System — MySQL 8 / MariaDB 10.6+ schema
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  name          VARCHAR(100) NOT NULL,
  role          ENUM('admin','manager','salesperson') NOT NULL DEFAULT 'salesperson',
  password_hash VARCHAR(100) NOT NULL,
  active        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS brands (
  id     INT AUTO_INCREMENT PRIMARY KEY,
  name   VARCHAR(100) NOT NULL UNIQUE,
  active TINYINT(1)   NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS categories (
  id     INT AUTO_INCREMENT PRIMARY KEY,
  name   VARCHAR(100) NOT NULL UNIQUE,
  active TINYINT(1)   NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS products (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  code           VARCHAR(30)   NOT NULL UNIQUE,         -- auto-generated Product ID, e.g. P000123
  model_code     VARCHAR(60)   NULL,                    -- manufacturer model / barcode, searchable at POS
  name           VARCHAR(150)  NOT NULL,
  brand_id       INT           NULL,
  category_id    INT           NOT NULL,
  purchase_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  sale_price     DECIMAL(12,2) NOT NULL DEFAULT 0,
  margin         DECIMAL(6,2)  NOT NULL DEFAULT 0,       -- % over purchase price
  stock_qty      INT           NOT NULL DEFAULT 0,
  threshold      INT           NOT NULL DEFAULT 5,
  active         TINYINT(1)    NOT NULL DEFAULT 1,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (brand_id)    REFERENCES brands(id),
  FOREIGN KEY (category_id) REFERENCES categories(id),
  INDEX (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_movements (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  product_id  INT          NOT NULL,
  change_qty  INT          NOT NULL,                     -- +restock / -sale / ±adjustment
  type        ENUM('initial','sale','restock','adjustment') NOT NULL,
  reason      VARCHAR(255) NULL,
  ref_sale_id INT          NULL,
  user_id     INT          NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  INDEX (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customers (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(100)  NOT NULL,
  address        VARCHAR(255)  NOT NULL,
  phone          VARCHAR(30)   NOT NULL UNIQUE,
  credit_balance DECIMAL(12,2) NOT NULL DEFAULT 0,       -- total currently owed
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sales (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  invoice_no     VARCHAR(30)   NOT NULL UNIQUE,
  client_uuid    VARCHAR(64)   NULL UNIQUE,              -- idempotency key for offline sync
  offline_ref    VARCHAR(30)   NULL,                    -- provisional number printed while offline
  created_at     DATETIME      NOT NULL,
  customer_id    INT           NOT NULL,
  subtotal       DECIMAL(12,2) NOT NULL,                 -- sum of original prices
  discount_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  total          DECIMAL(12,2) NOT NULL,                 -- grand total
  cost_total     DECIMAL(12,2) NOT NULL,                 -- for profit
  cash_paid      DECIMAL(12,2) NOT NULL,
  credit_amount  DECIMAL(12,2) NOT NULL DEFAULT 0,       -- outstanding at time of sale
  payment_type   ENUM('cash','credit') NOT NULL DEFAULT 'cash',
  salesperson_id INT           NOT NULL,
  archived       TINYINT(1)    NOT NULL DEFAULT 0,
  offline        TINYINT(1)    NOT NULL DEFAULT 0,
  FOREIGN KEY (customer_id)    REFERENCES customers(id),
  FOREIGN KEY (salesperson_id) REFERENCES users(id),
  INDEX (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sale_items (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  sale_id      INT           NOT NULL,
  product_id   INT           NOT NULL,
  product_name VARCHAR(150)  NOT NULL,                   -- snapshot for invoice
  category_id  INT           NOT NULL,
  qty          INT           NOT NULL,
  unit_price   DECIMAL(12,2) NOT NULL,                   -- original price
  unit_cost    DECIMAL(12,2) NOT NULL,
  discount     DECIMAL(12,2) NOT NULL DEFAULT 0,         -- total discount on the line
  line_total   DECIMAL(12,2) NOT NULL,                   -- final sale price for the line
  FOREIGN KEY (sale_id)    REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS credit_payments (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT           NOT NULL,
  sale_id     INT           NULL,
  amount      DECIMAL(12,2) NOT NULL,
  user_id     INT           NOT NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (sale_id)     REFERENCES sales(id),
  INDEX (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT          NULL,
  action     VARCHAR(60)  NOT NULL,
  details    TEXT         NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(50) PRIMARY KEY,
  v TEXT        NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS counters (
  name  VARCHAR(30) PRIMARY KEY,
  value INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

