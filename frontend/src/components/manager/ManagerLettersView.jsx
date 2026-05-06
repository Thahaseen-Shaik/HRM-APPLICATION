import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { deleteLetter, getEmployees, getLetters, sendLetter, updateLetter } from '../../services/managerService';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { useSiteLogo } from '../../hooks/useSiteLogo';

const templateContents = {
  offer: `To,<br>[Employee Name]<br><strong>Subject: Internship Offer at HRM Solutions LLC</strong><br><br>We are pleased to offer you an internship opportunity with HRM Solutions LLC as a <strong>Intern-Software Engineer</strong> in our <strong>Information Technology Department</strong>. This internship will provide you with practical experience and exposure to real-time projects and processes that align with your field of study and career goals.<br><br><strong>Internship Details</strong><br>1. Date of Joining: [Joining Date]<br>2. Stipend: [Stipend Amount]<br>3. Reporting Manager: [Manager Name]<br>4. Working Hours: 10:00 AM – 07:00 PM, Monday to Friday<br>5. Work Mode: Remote<br>6. PPO is based on the performance during the internship with a compensation package in the range of INR 6 LPA CTC.<br><br><strong>Roles & Responsibilities</strong><br>During your internship, you will be expected to: <br>1. Participate in assigned projects and tasks as per team requirements.<br>2. Learn and apply new tools, frameworks, or methodologies relevant to your domain.<br>3. Collaborate with team members under supervision.<br>4. Submit weekly progress reports and a final internship report/presentation upon completion.<br><br><strong>Confidentiality & Conduct</strong><br>You are required to maintain the confidentiality of all information, code, documents, and communications that you are exposed to during the internship. All intellectual property developed during your internship shall be the sole property of HRM Solutions LLC. Any misconduct, violation of company policy, or breach of confidentiality may result in immediate termination of the internship.<br><br><strong>Certification</strong><br>Upon successful completion of the internship, you will be awarded an Internship Completion Certificate, subject to satisfactory performance and adherence to guidelines.<br><br><strong>Acceptance of Offer</strong><br>Please confirm your acceptance of this internship by signing and returning a scanned copy of this letter on or before one week of the specified joining date.<br><br>We look forward to welcoming you to HRM Solutions LLC and wish you a fruitful and learning-rich internship experience.`,
  promotion: `Dear [Employee Name],<br><br><strong>Congratulations!</strong> We are delighted to inform you of your promotion to the position of <strong>[New Job Title]</strong>, effective from [Effective Date].<br><br>This promotion is a recognition of your hard work, dedication, and the significant impact you have made on our team. Your new annual compensation will be [New Salary].<br><br>We are confident that you will continue to excel in your new role and contribute to the ongoing success of HRM Solutions LLC.`,
  appreciation: `Dear [Employee Name],<br><br>This letter is to express our sincere <strong>Appreciation</strong> for your outstanding performance and dedication to HRM Solutions LLC. Your contributions to <strong>[Project Name/Specific Area]</strong> have been exceptional.<br><br>Your commitment to excellence and your positive attitude are an inspiration to the entire team. Thank you for your hard work and for being such a valuable member of our organization.`,
  relieving: `Dear [Employee Name],<br><br>This is to certify that <strong>[Employee Name]</strong> was employed with HRM Solutions LLC from [Start Date] to [End Date]. During this period, they served as <strong>[Last Designation]</strong>.<br><br>We would like to confirm that [Employee Name] is being relieved of their duties effective [End Date]. We appreciate the contributions made during their tenure and wish them the very best in their future professional endeavors.`,
  warning: `Dear [Employee Name],<br><br>This is a <strong>Formal Warning Letter</strong> regarding [Issue]. Despite previous verbal discussions, we have not seen the required improvement in <strong>[Area of concern]</strong>.<br><br>We expect to see immediate and sustained improvement in your performance/conduct. Please be advised that further instances of this nature may lead to more severe disciplinary action, up to and including termination of employment.`,
  internship: `Dear [Employee Name],<br><br>This is to certify that <strong>[Employee Name]</strong> has successfully completed their internship with HRM Solutions LLC from [Start Date] to [End Date]. During this period, they worked with the <strong>[Department Name]</strong> team as an Intern.<br><br>They demonstrated a keen interest in learning and contributed effectively to the team's objectives. Their performance during the internship was <strong>[Rating]</strong>. We wish them all the best in their academic and professional journey ahead.`,
  termination: `Dear [Employee Name],<br><br>We regret to inform you that your employment with HRM Solutions LLC is being <strong>Terminated</strong>, effective [Effective Date]. This decision has been made due to [Reason].<br><br>Your final paycheck and benefits information will be provided separately. Please return all company property by [Date]. We wish you the best in your future endeavors.`,
  confirmation: `Dear [Employee Name],<br><br>We are pleased to inform you that you have successfully completed your <strong>Probation Period</strong> at HRM Solutions LLC. We are happy to confirm your permanent appointment as <strong>[Job Title]</strong>.<br><br>All other terms and conditions of your employment remain unchanged. We look forward to your continued growth and success with the organization.`
};

const quillModules = {
  toolbar: [
    [{ font: [] }],
    [{ header: [1, 2, false] }],
    ['bold', 'italic', 'underline'],
    [{ list: 'ordered' }, { list: 'bullet' }]
  ]
};

const ManagerLettersView = () => {
  const [employees, setEmployees] = useState([]);
  const [letters, setLetters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const logoUrl = useSiteLogo();

  const [form, setForm] = useState({ employee_id: '', title: '', content: '' });
  const [template, setTemplate] = useState('');
  const [sending, setSending] = useState(false);

  const [previewLetter, setPreviewLetter] = useState(null);
  const [editingLetter, setEditingLetter] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [empRes, letterRes] = await Promise.all([getEmployees(), getLetters()]);
      if (empRes.success) setEmployees(empRes.data || []);
      if (letterRes.success) setLetters(letterRes.data || []);
    } catch (e) {
      setError(e?.message || 'Failed to load letters');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const selectableEmployees = useMemo(() => {
    return employees || [];
  }, [employees]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!form.employee_id || !form.title.trim() || !form.content.trim()) return;
    setSending(true);
    setError('');
    try {
      const res = await sendLetter({ ...form, title: form.title.trim(), content: form.content.trim() });
      if (!res.success) throw new Error(res.error || 'Failed to send letter');
      setForm({ employee_id: '', title: '', content: '' });
      load();
    } catch (err) {
      setError(err?.message || 'Failed to send letter');
    } finally {
      setSending(false);
    }
  };

  const handleEdit = (letter) => {
    setEditingLetter(letter);
    setEditTitle(letter?.title || '');
    setEditContent(letter?.content || '');
  };

  const handleSave = async () => {
    if (!editingLetter) return;
    if (!editTitle.trim() || !editContent.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await updateLetter(editingLetter.letter_id, { title: editTitle.trim(), content: editContent.trim() });
      if (!res.success) throw new Error(res.error || 'Update failed');
      setEditingLetter(null);
      setEditTitle('');
      setEditContent('');
      load();
    } catch (e) {
      setError(e?.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm('Delete this letter?')) return;
    setError('');
    try {
      const res = await deleteLetter(id);
      if (!res.success) throw new Error(res.error || 'Delete failed');
      load();
    } catch (e) {
      setError(e?.message || 'Delete failed');
    }
  };

  return (
    <div className="view">
      <div className="page-header">
        <h1 className="page-h1">Letter Management</h1>
      </div>

      {error && <div style={{ color: '#b91c1c', marginBottom: 12 }}>{error}</div>}

      <div className="grid grid-2" style={{ padding: 0 }}>
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Send New Letter</div>
          </div>
          <div className="panel-body">
            <form onSubmit={handleSend}>
              <label className="form-label">Select Employee</label>
              <select className="input" value={form.employee_id} onChange={(e) => setForm((p) => ({ ...p, employee_id: e.target.value }))} required>
                <option value="">Select Employee</option>
                <option value="all">All Employees</option>
                {selectableEmployees.filter(Boolean).map((e) => (
                  <option key={e.employee_id} value={e.employee_id}>
                    {e.employee_name || `Employee #${e.employee_id}`}
                  </option>
                ))}
              </select>

              <label className="form-label">Select Template</label>
              <select 
                className="input" 
                value={template} 
                onChange={(e) => {
                  const val = e.target.value;
                  const text = e.target.options[e.target.selectedIndex].text;
                  setTemplate(val);
                  if (val) {
                    setForm(p => ({ ...p, title: text, content: templateContents[val] || '' }));
                  } else {
                    setForm(p => ({ ...p, title: '', content: '' }));
                  }
                }}
              >
                <option value="">-- Custom (Blank) --</option>
                <option value="offer">Offer Letter</option>
                <option value="promotion">Promotion Letter</option>
                <option value="appreciation">Appreciation Letter</option>
                <option value="relieving">Relieving &amp; Experience Letter</option>
                <option value="warning">Warning Letter</option>
                <option value="internship">Internship Completion</option>
                <option value="termination">Termination Letter</option>
                <option value="confirmation">Probation Confirmation</option>
              </select>

              <label className="form-label">Letter Title</label>
              <input className="input" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="e.g. Promotion Letter" required />

              <div style={{ marginBottom: '80px' }}>
                <ReactQuill 
                  theme="snow"
                  modules={quillModules}
                  value={form.content} 
                  onChange={(val) => setForm((p) => ({ ...p, content: val }))}
                  style={{ height: '200px' }}
                />
              </div>

              <button type="submit" className="btn btn-solid" style={{ width: '100%' }} disabled={sending}>
                {sending ? 'Sending...' : 'Send Letter'}
              </button>
            </form>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Sent Letters</div>
          </div>
          <div className="table-wrap" style={{ padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Sent To</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center' }}>
                      Loading...
                    </td>
                  </tr>
                ) : letters.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center' }}>
                      No letters found
                    </td>
                  </tr>
                ) : (
                  letters.map((l) => (
                    <tr key={l.letter_id}>
                      <td>
                        <strong>{l.title}</strong>
                      </td>
                      <td>{l.Recipient?.employee_name || 'N/A'}</td>
                      <td>
                        <span className={`badge ${l.status === 'Sent' ? 'bg-green' : 'bg-yellow'}`}>{l.status}</span>
                      </td>
                      <td>{l.created_at ? new Date(l.created_at).toLocaleString() : '-'}</td>
                      <td>
                        <button type="button" className="btn btn-outline" onClick={() => setPreviewLetter(l)} style={{ marginRight: 8, padding: '8px 12px' }} title="Preview">
                          <i className="fas fa-eye"></i>
                        </button>
                        <button type="button" className="btn btn-outline" onClick={() => handleEdit(l)} style={{ marginRight: 8, padding: '8px 12px' }} title="Edit">
                          <i className="fas fa-edit"></i>
                        </button>
                        <button type="button" className="btn btn-outline" onClick={() => handleDelete(l.letter_id)} style={{ borderColor: '#ef4444', color: '#ef4444', padding: '8px 12px' }} title="Delete">
                          <i className="fas fa-trash"></i>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {previewLetter && createPortal(
        <div className="modal">
          <div className="modal-content" style={{ maxWidth: 900 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{previewLetter.title}</h2>
              <button type="button" className="btn btn-outline" onClick={() => setPreviewLetter(null)}>
                Close
              </button>
            </div>
            <div
              style={{
                background: '#fff',
                padding: '40px',
                borderRadius: 8,
                maxHeight: '70vh',
                overflowY: 'auto',
                border: '1px solid #e2e8f0',
                fontFamily: "'Segoe UI', Arial, sans-serif",
                color: '#000',
                lineHeight: '1.5',
                fontSize: '14px',
              }}
            >
              <div style={{ textAlign: 'left', marginBottom: '30px' }}>
                <img src={logoUrl} alt="Company Logo" style={{ maxHeight: '60px' }} />
              </div>
              <div style={{ textAlign: 'center', fontSize: '18px', fontWeight: 'bold', textDecoration: 'underline', marginBottom: '30px', textTransform: 'uppercase' }}>
                {previewLetter.title}
              </div>
              <div style={{ marginBottom: '20px' }}>
                Date: {new Date(previewLetter.created_at || Date.now()).toLocaleDateString()}<br/><br/>
              </div>
              <div 
                style={{ whiteSpace: 'pre-wrap', marginBottom: '40px', textAlign: 'justify' }}
                dangerouslySetInnerHTML={{ __html: (previewLetter.content || '').replace(/^(<p>)?\s*Dear\s+.*?<\/p>[\r\n\s]*/i, '') }}
              />
              <div style={{ marginTop: '60px' }}>
                <strong>Thanks & Regards</strong><br/>
                <strong>Hiring Team - HRM Solutions LLC</strong><br/>
                Mount Tabor Road, Odessa, Missouri, United States | Ph: +91-9429694298<br/>
                www.hrm.com<br/><br/>
                <div style={{ textAlign: 'left', marginTop: '20px' }}>
                  <img src="/Signature.png" alt="Signature" style={{ maxHeight: '100px' }} onError={(e) => e.target.style.display = 'none'} />
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {editingLetter && createPortal(
        <div className="modal">
          <div className="modal-content" style={{ maxWidth: 900 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Edit Letter</h2>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setEditingLetter(null);
                  setEditTitle('');
                  setEditContent('');
                }}
                disabled={saving}
              >
                Close
              </button>
            </div>
            <label className="form-label">Title</label>
            <input className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            <label className="form-label">Content (Rich Text allowed)</label>
            <div style={{ marginBottom: '60px' }}>
              <ReactQuill 
                theme="snow"
                modules={quillModules}
                value={editContent} 
                onChange={setEditContent}
                style={{ height: '300px' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setEditingLetter(null);
                  setEditTitle('');
                  setEditContent('');
                }}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="button" className="btn btn-solid" onClick={handleSave} disabled={saving || !editTitle.trim() || !editContent.trim()}>
                {saving ? 'Updating...' : 'Update'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ManagerLettersView;

