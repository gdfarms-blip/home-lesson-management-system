const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function runMigrations() {
  try {
    console.log('Starting database migrations...');
    
    // Read schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    
    // Split SQL by semicolons and execute each statement
    const statements = schemaSQL.split(';').filter(stmt => stmt.trim());
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      if (statement.trim()) {
        await pool.query(statement);
        console.log(`Executed statement ${i + 1}/${statements.length}`);
      }
    }
    
    console.log('Database migrations completed successfully!');
    
    // Insert sample data for testing
    await insertSampleData();
    
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function insertSampleData() {
  console.log('Inserting sample data...');
  
  // Insert sample teachers
  const teachers = [
    {
      name: 'Mr. Juma',
      phone: '+265 991 234 567',
      email: 'juma.maths@example.com',
      subjects: ['Mathematics', 'Physics', 'Chemistry'],
      teaching_allowance: 20000,
      transport_allowance: 12000,
      status: 'active'
    },
    {
      name: 'Madam Chaweza',
      phone: '+265 992 345 678',
      email: 'chaweza.english@example.com',
      subjects: ['English', 'Chichewa'],
      teaching_allowance: 20000,
      transport_allowance: 12000,
      status: 'active'
    },
    {
      name: 'Madam Misomali',
      phone: '+265 993 456 789',
      email: 'misomali.geography@example.com',
      subjects: ['Geography', 'Biology'],
      teaching_allowance: 20000,
      transport_allowance: 12000,
      status: 'active'
    }
  ];
  
  for (const teacher of teachers) {
    await pool.query(
      `INSERT INTO teachers (name, phone, email, subjects, teaching_allowance, transport_allowance, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING`,
      [teacher.name, teacher.phone, teacher.email, teacher.subjects, 
       teacher.teaching_allowance, teacher.transport_allowance, teacher.status]
    );
  }
  
  console.log('Sample data inserted successfully!');
}

runMigrations();
