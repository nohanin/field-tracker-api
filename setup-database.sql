-- Database setup script for Field Tracker API
-- Run this on your Azure PostgreSQL database

-- Create employees table
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20),
    pin_code VARCHAR(10), -- Employee PIN for login
    assigned_location_id INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- Create locations table
CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    radius_meters INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create attendance table (with separate location_code columns for check-in and check-out)
CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
    check_in_time TIMESTAMP NULL,
    check_out_time TIMESTAMP NULL,
    check_in_latitude DECIMAL(10, 8) NULL,
    check_in_longitude DECIMAL(11, 8) NULL,
    check_out_latitude DECIMAL(10, 8) NULL,
    check_out_longitude DECIMAL(11, 8) NULL,
    location_verified BOOLEAN DEFAULT false,
    total_hours DECIMAL(5, 2) NULL, -- Calculated on check-out
    check_in_location_code VARCHAR(15) NULL, -- Location code for check-in
    check_out_location_code VARCHAR(15) NULL, -- Location code for check-out
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert test employee with PIN
INSERT INTO employees (name, email, phone, pin_code, is_active) 
VALUES ('Test Employee', 'test@example.com', '1234567890', '1234', true)
ON CONFLICT (email) DO UPDATE SET 
    pin_code = EXCLUDED.pin_code,
    updated_at = CURRENT_TIMESTAMP;

-- Insert test location
INSERT INTO locations (name, latitude, longitude, radius_meters) 
VALUES ('Test Office', 28.7041, 77.1025, 100)
ON CONFLICT DO NOTHING;

-- Check if data was inserted correctly
SELECT 'Employees:' as table_name;
SELECT id, name, email, pin_code, is_active FROM employees;

SELECT 'Locations:' as table_name;
SELECT id, name, latitude, longitude, radius_meters FROM locations;