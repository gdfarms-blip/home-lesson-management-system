const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const pool = require('../config/database');
const { jsPDF } = require('jspdf');
require('jspdf-autotable');

// Generate teacher report
router.post('/teacher/:teacherId', authMiddleware, async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { week, year } = req.query;
    
    // Get teacher details
    const teacherResult = await pool.query(
      `SELECT * FROM teachers WHERE id = $1`,
      [teacherId]
    );
    
    if (teacherResult.rows.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    const teacher = teacherResult.rows[0];
    
    // Get attendance for the week
    const attendanceResult = await pool.query(
      `SELECT 
        a.status,
        a.notes,
        a.recorded_at,
        tt.day_of_week,
        tt.time_slot,
        s.name as subject_name
       FROM attendance a
       JOIN timetable tt ON a.timetable_id = tt.id
       LEFT JOIN subjects s ON tt.subject_id = s.id
       WHERE a.teacher_id = $1 
         AND a.week_number = $2 
         AND a.year = $3
       ORDER BY tt.day_of_week, tt.time_slot`,
      [teacherId, week || 1, year || new Date().getFullYear()]
    );
    
    // Get payroll for the week
    const payrollResult = await pool.query(
      `SELECT * FROM payroll 
       WHERE teacher_id = $1 
         AND week_number = $2 
         AND year = $3`,
      [teacherId, week || 1, year || new Date().getFullYear()]
    );
    
    // Create PDF (simplified version - in production, use a proper PDF generation library)
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text('Teacher Performance Report', 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text(`Teacher: ${teacher.name}`, 20, 40);
    doc.text(`Week: ${week || 1}, ${year || new Date().getFullYear()}`, 20, 50);
    
    // Save report to database
    const reportResult = await pool.query(
      `INSERT INTO reports (report_type, description, generated_by)
       VALUES ($1, $2, $3)
       RETURNING *`,
      ['teacher', `Teacher report for ${teacher.name} - Week ${week || 1}`, req.user.id]
    );
    
    res.json({
      message: 'Report generated successfully',
      report: reportResult.rows[0],
      data: {
        teacher,
        attendance: attendanceResult.rows,
        payroll: payrollResult.rows[0] || {}
      }
    });
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get report history
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const { limit = 10, offset = 0 } = req.query;
    
    const result = await pool.query(
      `SELECT r.*, u.username as generated_by_name
       FROM reports r
       LEFT JOIN users u ON r.generated_by = u.id
       ORDER BY r.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    
    const totalResult = await pool.query(
      'SELECT COUNT(*) as total FROM reports'
    );
    
    res.json({
      reports: result.rows,
      total: parseInt(totalResult.rows[0].total)
    });
  } catch (error) {
    console.error('Error fetching report history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export system data
router.get('/export', authMiddleware, async (req, res) => {
  try {
    // Get all data
    const [
      teachers,
      timetable,
      attendance,
      payroll,
      paymentHistory,
      subjects
    ] = await Promise.all([
      pool.query('SELECT * FROM teachers'),
      pool.query('SELECT * FROM timetable'),
      pool.query('SELECT * FROM attendance'),
      pool.query('SELECT * FROM payroll'),
      pool.query('SELECT * FROM payment_history'),
      pool.query('SELECT * FROM subjects')
    ]);
    
    const exportData = {
      export_date: new Date().toISOString(),
      teachers: teachers.rows,
      timetable: timetable.rows,
      attendance: attendance.rows,
      payroll: payroll.rows,
      payment_history: paymentHistory.rows,
      subjects: subjects.rows
    };
    
    res.json(exportData);
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
