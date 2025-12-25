const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware } = require('../middleware/auth.middleware');
const pool = require('../config/database');
const { body, validationResult } = require('express-validator');

// Get all teachers
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, 
       COALESCE((
         SELECT json_agg(json_build_object(
           'week_number', a.week_number,
           'year', a.year,
           'percentage', (
             SELECT ROUND((COUNT(*) FILTER (WHERE status IN ('present', 'late')) * 100.0 / 
                     COUNT(*)), 0)
             FROM attendance a2 
             WHERE a2.teacher_id = t.id 
             AND a2.week_number = a.week_number 
             AND a2.year = a.year
           )
         ))
         FROM attendance a
         WHERE a.teacher_id = t.id
         GROUP BY a.week_number, a.year
         ORDER BY a.year DESC, a.week_number DESC
         LIMIT 4
       ), '[]') as attendance_history
       FROM teachers t
       ORDER BY t.name`
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching teachers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single teacher
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT t.*,
       COALESCE((
         SELECT json_agg(json_build_object(
           'week_number', p.week_number,
           'year', p.year,
           'total_amount', p.total_amount,
           'paid', p.paid
         ))
         FROM payroll p
         WHERE p.teacher_id = t.id
         ORDER BY p.year DESC, p.week_number DESC
         LIMIT 8
       ), '[]') as payroll_history
       FROM teachers t
       WHERE t.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching teacher:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create teacher
router.post('/', [
  authMiddleware,
  adminMiddleware,
  body('name').notEmpty().trim(),
  body('phone').optional().isMobilePhone(),
  body('email').optional().isEmail(),
  body('subjects').isArray(),
  body('teaching_allowance').isInt({ min: 0 }),
  body('transport_allowance').isInt({ min: 0 }),
  body('status').isIn(['active', 'inactive', 'on-leave'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const {
      name,
      phone,
      email,
      subjects,
      teaching_allowance,
      transport_allowance,
      status,
      notes
    } = req.body;
    
    const result = await pool.query(
      `INSERT INTO teachers 
       (name, phone, email, subjects, teaching_allowance, transport_allowance, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [name, phone, email, subjects, teaching_allowance, transport_allowance, status, notes]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating teacher:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update teacher
router.put('/:id', [
  authMiddleware,
  adminMiddleware,
  body('name').optional().notEmpty().trim(),
  body('phone').optional().isMobilePhone(),
  body('email').optional().isEmail(),
  body('subjects').optional().isArray(),
  body('teaching_allowance').optional().isInt({ min: 0 }),
  body('transport_allowance').optional().isInt({ min: 0 }),
  body('status').optional().isIn(['active', 'inactive', 'on-leave'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { id } = req.params;
    const updates = req.body;
    
    // Build dynamic update query
    const setClauses = [];
    const values = [];
    let paramIndex = 1;
    
    Object.keys(updates).forEach(key => {
      if (key !== 'id') {
        setClauses.push(`${key} = $${paramIndex}`);
        values.push(updates[key]);
        paramIndex++;
      }
    });
    
    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    setClauses.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    
    const query = `
      UPDATE teachers 
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating teacher:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete teacher
router.delete('/:id', [authMiddleware, adminMiddleware], async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if teacher exists
    const teacherCheck = await pool.query(
      'SELECT id FROM teachers WHERE id = $1',
      [id]
    );
    
    if (teacherCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    // Delete teacher (cascade will handle related records)
    await pool.query('DELETE FROM teachers WHERE id = $1', [id]);
    
    res.json({ message: 'Teacher deleted successfully' });
  } catch (error) {
    console.error('Error deleting teacher:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get teacher attendance summary
router.get('/:id/attendance/:week?/:year?', authMiddleware, async (req, res) => {
  try {
    const { id, week, year } = req.params;
    const currentWeek = week || Math.floor((new Date().getDate() - 1) / 7) + 1;
    const currentYear = year || new Date().getFullYear();
    
    const result = await pool.query(
      `SELECT 
        COUNT(*) as total_lessons,
        COUNT(*) FILTER (WHERE status = 'present') as present,
        COUNT(*) FILTER (WHERE status = 'absent') as absent,
        COUNT(*) FILTER (WHERE status = 'late') as late,
        COUNT(*) FILTER (WHERE status = 'partial') as partial,
        ROUND((COUNT(*) FILTER (WHERE status IN ('present', 'late')) * 100.0 / 
               COUNT(*)), 0) as percentage
       FROM attendance
       WHERE teacher_id = $1 
         AND week_number = $2 
         AND year = $3`,
      [id, currentWeek, currentYear]
    );
    
    res.json(result.rows[0] || {
      total_lessons: 0,
      present: 0,
      absent: 0,
      late: 0,
      partial: 0,
      percentage: 0
    });
  } catch (error) {
    console.error('Error fetching attendance summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
