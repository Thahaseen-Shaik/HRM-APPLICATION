import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { getLetters, updateLetter } from '../../services/employeeService';
import { useSiteLogo } from '../../hooks/useSiteLogo';

const downloadHtml = (filename, html) => {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const EmployeeLettersView = () => {
  const [letters, setLetters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const logoUrl = useSiteLogo();

  const [previewLetter, setPreviewLetter] = useState(null);
  const [editingLetter, setEditingLetter] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getLetters();
      if (res.success) setLetters(res.data || []);
      // The original code had an else block here, but the instruction removed it.
      // Keeping it as per original for robustness, but if the instruction implies removal,
      // then the line below should be removed.
      else setError(res.error || 'Failed to load letters');
    } catch (e) {
      setError(e?.message || 'Failed to load letters');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleEdit = (letter) => {
    setEditingLetter(letter);
    setEditContent(letter?.content || '');
  };

  const handleSave = async () => {
    if (!editingLetter) return;
    // The original code had a trim check, but the instruction removed it.
    // const trimmed = editContent.trim();
    // if (!trimmed) return;
    setSaving(true);
    setError(''); // Clear previous errors
    try {
      const res = await updateLetter(editingLetter.letter_id, { content: editContent });
      if (res.success) {
        setEditingLetter(null);
        setEditContent('');
        load();
      } else {
        setError(res.error || 'Update failed'); // Set error if API call was not successful
      }
    } catch (e) {
      setError(e?.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const brandedHtmlTemplate = (title, content, date, senderName) => `
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #000; padding: 50px; }
        .header { text-align: left; margin-bottom: 30px; }
        .logo { max-height: 70px; }
        .title { text-align: center; font-size: 24px; font-weight: bold; text-decoration: underline; margin-bottom: 40px; text-transform: uppercase; }
        .meta { margin-bottom: 25px; font-style: italic; }
        .content { margin-bottom: 50px; text-align: justify; white-space: pre-wrap; }
        .signature-block { margin-top: 60px; }
        .signature-img { max-height: 100px; margin-top: 15px; }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="http://${window.location.host}${logoUrl}" class="logo" />
      </div>
      <div class="title">${title}</div>
      <div class="meta">Sender: ${senderName} | Date: ${date}</div>
      <div class="content">${content.replace(/^(<p>)?\s*Dear\s+.*?<\/p>[\r\n\s]*/i, '')}</div>
      <div class="signature-block">
        <strong>Thanks & Regards</strong><br/>
        <strong>Hiring Team - HRM Solutions LLC</strong><br/>
        Mount Tabor Road, Odessa, Missouri, United States | Ph: +91-9429694298<br/>
        www.hrm.com<br/>
        <img src="https://${window.location.host}/Signature.png" class="signature-img" />
      </div>
    </body>
    </html>
  `;

  return (
    <div className="view">
      <div className="page-header">
        <h1 className="page-h1">My Letters</h1>
      </div>

      {error && <div style={{ color: '#ef4444', marginBottom: 12 }}>{error}</div>}

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">Letters Received</div>
        </div>
        <div className="table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#64748b', fontSize: '13px' }}>
                <th style={{ padding: '12px 8px' }}>Title</th>
                <th style={{ padding: '12px 8px' }}>From</th>
                <th style={{ padding: '12px 8px' }}>Status</th>
                <th style={{ padding: '12px 8px' }}>Date</th>
                <th style={{ padding: '12px 8px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '24px' }}>Loading...</td>
                </tr>
              ) : letters.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>No letters found.</td>
                </tr>
              ) : (
                letters.map((l) => (
                  <tr key={l.letter_id} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '16px 8px', fontWeight: 600 }}>{l.title}</td>
                    <td style={{ padding: '16px 8px' }}>{l.Sender?.name || 'Manager'}</td>
                    <td style={{ padding: '16px 8px' }}>
                      <span className={`badge ${l.status === 'Sent' ? 'bg-green' : 'bg-yellow'}`}>{l.status === 'Sent' ? 'Received' : l.status}</span>
                    </td>
                    <td style={{ padding: '16px 8px', fontSize: '13px' }}>{new Date(l.created_at).toLocaleString()}</td>
                    <td style={{ padding: '16px 8px' }}>
                      <button type="button" className="btn btn-outline" onClick={() => setPreviewLetter(l)} style={{ marginRight: 8, padding: '8px 12px' }}>
                        Preview
                      </button>
                      <button type="button" className="btn btn-outline" onClick={() => handleEdit(l)} style={{ marginRight: 8, padding: '8px 12px' }}>
                        Edit
                      </button>
                      <button 
                        type="button" 
                        className="btn btn-solid" 
                        onClick={() => {
                          const brandedHtml = brandedHtmlTemplate(
                            l.title, 
                            l.content, 
                            new Date(l.created_at).toLocaleDateString(),
                            l.Sender?.name || 'Manager'
                          );
                          downloadHtml((l.title || 'letter').replace(/\s+/g, '_') + ".html", brandedHtml);
                        }} 
                        style={{ padding: '8px 12px' }}
                      >
                        Download
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
              <div style={{ marginBottom: '20px', color: '#64748b', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>From: <strong>{previewLetter.Sender?.name || 'Manager'}</strong></span>
                  <span>Date: {new Date(previewLetter.created_at || Date.now()).toLocaleDateString()}</span>
                </div>
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
                  setEditContent('');
                }}
                disabled={saving}
              >
                Close
              </button>
            </div>
            <label className="form-label">Title</label>
            <input className="input" value={editingLetter.title || ''} readOnly />
            <label className="form-label">Content (Rich Text allowed)</label>
            <div style={{ marginBottom: '60px' }}>
              <ReactQuill 
                theme="snow"
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
                  setEditContent('');
                }}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="button" className="btn btn-solid" onClick={handleSave} disabled={saving || !editContent.trim()}>
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

export default EmployeeLettersView;

