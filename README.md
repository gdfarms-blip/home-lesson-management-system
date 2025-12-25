# Home Lesson Management System - Backend

## Overview
This is the backend API for the Home Lesson Management System, built with Node.js, Express, and PostgreSQL (Neon).

## Features
- Teacher management
- Attendance tracking
- Timetable management
- Payroll processing
- Analytics and reporting
- User authentication

## Tech Stack
- Node.js & Express
- PostgreSQL (Neon)
- JWT Authentication
- Bcrypt for password hashing

## Setup Instructions

### 1. Local Development
```bash
# Clone the repository
git clone <repository-url>
cd home-lesson-management-system

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Set up database (using Neon)
# Create a database on Neon.tech and update DATABASE_URL in .env

# Run database migrations
npm run migrate

# Start development server
npm run dev
