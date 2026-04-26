import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Wrench, AlertTriangle, X, History as HistoryIcon, Users } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const ACTION_LABELS = {
  created: 'Utworzono',
  updated: 'Edytowano',
  deleted: 'Usunieto',
  assigned: 'Przypisano',
  transfer_requested: 'Przekazanie zlozone',
  transfer_accepted: 'Przekazanie zaakceptowane',
  transfer_rejected: 'Przekazanie odrzucone',
  defect_reported: 'Zgloszono usterke',
};

export const PublicEquipment = () => {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDefectModal, setShowDefectModal] = useState(false);
  const [reporterName, setReporterName] = useState(
    localStorage.getItem('qr_reporter_name') || ''
  );
  const [defectQty, setDefectQty] = useState('1');
  const [defectDesc, setDefectDesc] = useState('');
  const [defectPhoto, setDefectPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/public/equipment/${token}`);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Nie znaleziono sprzetu');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Maks 2MB');
      return;
    }
    const b64 = await fileToBase64(file);
    setDefectPhoto(b64);
  };

  const submitDefect = async () => {
    const qty = parseInt(defectQty, 10);
    if (!reporterName.trim()) {
      toast.error('Podaj imie i nazwisko');
      return;
    }
    if (Number.isNaN(qty) || qty <= 0) {
      toast.error('Podaj poprawna ilosc');
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API}/public/equipment/${token}/defect`, {
        reporter_name: reporterName.trim(),
        quantity: qty,
        description: defectDesc || null,
        photo: defectPhoto,
      });
      localStorage.setItem('qr_reporter_name', reporterName.trim());
      toast.success('Usterka zgloszona — dziekujemy!');
      setShowDefectModal(false);
      setDefectQty('1');
      setDefectDesc('');
      setDefectPhoto(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad zgloszenia');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1E293B] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#5F7151]"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#1E293B] flex items-center justify-center p-4">
        <Card className="bg-[#2A384C] border-[#7F2D2D] max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 text-[#FCA5A5] mx-auto mb-3" />
            <p className="text-[#FCA5A5] font-bold">{error}</p>
            <p className="text-[#94A3B8] text-sm mt-2">
              Skontaktuj sie z administratorem.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusLabel = {
    working: { label: 'Sprawny', cls: 'bg-[#5F7151] text-white' },
    broken: { label: 'Zepsuty', cls: 'bg-[#7F2D2D] text-[#FCA5A5]' },
    maintenance: { label: 'W naprawie', cls: 'bg-[#92400E] text-[#FED7AA]' },
  }[data.status] || { label: data.status, cls: 'bg-[#334155] text-[#CBD5E1]' };

  return (
    <div className="min-h-screen bg-[#1E293B] py-6 px-4" data-testid="public-equipment">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header card */}
        <Card className="bg-[#2A384C] border-[#334155]">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              {data.photo ? (
                <img
                  src={data.photo}
                  alt={data.name}
                  className="w-28 h-28 rounded-lg object-cover bg-[#0F172A]"
                />
              ) : (
                <div className="w-28 h-28 rounded-lg bg-[#0F172A] flex items-center justify-center">
                  <Wrench className="h-12 w-12 text-[#475569]" />
                </div>
              )}
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-[#CBD5E1]">{data.name}</h1>
                {data.brand && <p className="text-[#94A3B8]">{data.brand}</p>}
                <span
                  className={`inline-block mt-2 text-xs px-2 py-1 rounded font-semibold ${statusLabel.cls}`}
                  data-testid="equipment-status"
                >
                  {statusLabel.label}
                </span>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-[#1E293B] rounded p-2">
                    <p className="text-[#94A3B8]">Razem</p>
                    <p className="text-[#CBD5E1] font-bold text-lg">{data.total_quantity}</p>
                  </div>
                  <div className="bg-[#1E293B] rounded p-2">
                    <p className="text-[#94A3B8]">Przypisane</p>
                    <p className="text-[#5F7151] font-bold text-lg">{data.assigned_quantity}</p>
                  </div>
                  <div className="bg-[#1E293B] rounded p-2">
                    <p className="text-[#94A3B8]">Wolne</p>
                    <p className="text-[#CBD5E1] font-bold text-lg">{data.available_quantity}</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Holders */}
        <Card className="bg-[#2A384C] border-[#334155]">
          <CardHeader>
            <CardTitle className="text-[#CBD5E1] flex items-center gap-2 text-base">
              <Users className="h-5 w-5 text-[#5F7151]" />
              Kto posiada
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.holders.length === 0 ? (
              <p className="text-[#94A3B8] text-sm">Aktualnie nikt nie ma przypisanego sprzetu.</p>
            ) : (
              <div className="space-y-2" data-testid="holders-list">
                {data.holders.map((h, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center p-2 bg-[#1E293B] rounded border border-[#334155]"
                  >
                    <div>
                      <p className="text-[#CBD5E1] font-semibold">{h.foreman_name}</p>
                      {h.assigned_at && (
                        <p className="text-xs text-[#64748B]">
                          od {new Date(h.assigned_at).toLocaleDateString('pl-PL')}
                        </p>
                      )}
                    </div>
                    <span className="text-[#5F7151] font-bold text-lg">{h.quantity} szt.</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Defect button */}
        <Button
          onClick={() => setShowDefectModal(true)}
          className="w-full bg-[#E8836A] hover:bg-[#C56A52] text-white py-6 text-base font-bold"
          data-testid="public-defect-btn"
        >
          <AlertTriangle className="h-5 w-5 mr-2" />
          Zglos usterke
        </Button>

        {/* History */}
        <Card className="bg-[#2A384C] border-[#334155]">
          <CardHeader>
            <CardTitle className="text-[#CBD5E1] flex items-center gap-2 text-base">
              <HistoryIcon className="h-5 w-5 text-[#5F7151]" />
              Ostatnie zdarzenia
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.history.length === 0 ? (
              <p className="text-[#94A3B8] text-sm">Brak wpisow.</p>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto" data-testid="public-history">
                {data.history.map((h) => (
                  <div
                    key={h.id}
                    className="text-xs p-2 bg-[#1E293B] rounded border border-[#334155]"
                  >
                    <span className="text-[#5F7151] font-semibold">
                      {ACTION_LABELS[h.action] || h.action}
                    </span>
                    {h.details?.foreman_name && (
                      <span className="text-[#94A3B8]">
                        {' '}
                        — {h.details.foreman_name} ({h.details.quantity ?? '?'})
                      </span>
                    )}
                    {h.details?.to_foreman_name && (
                      <span className="text-[#94A3B8]">
                        {' '}
                        — {h.details.to_foreman_name} ({h.details.quantity ?? '?'})
                      </span>
                    )}
                    {h.details?.description && (
                      <span className="text-[#94A3B8]"> — "{h.details.description}"</span>
                    )}
                    <div className="text-[#64748B] text-xs mt-0.5">
                      {h.actor_name} · {new Date(h.created_at).toLocaleString('pl-PL')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-[#64748B] pt-2">FeGrro · Sprzet</p>
      </div>

      {/* Defect Modal */}
      {showDefectModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4">
          <Card className="bg-[#2A384C] border-[#334155] w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-[#CBD5E1] text-base">Zglos usterke: {data.name}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowDefectModal(false)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-[#94A3B8] mb-1 block">Imie i nazwisko *</label>
                <Input
                  value={reporterName}
                  onChange={(e) => setReporterName(e.target.value)}
                  className="bg-[#1E293B] border-[#334155] text-[#CBD5E1]"
                  data-testid="public-reporter-name"
                />
              </div>
              <div>
                <label className="text-xs text-[#94A3B8] mb-1 block">Ilosc szt. *</label>
                <Input
                  type="number"
                  min="1"
                  value={defectQty}
                  onChange={(e) => setDefectQty(e.target.value)}
                  className="bg-[#1E293B] border-[#334155] text-[#CBD5E1]"
                  data-testid="public-defect-qty"
                />
              </div>
              <div>
                <label className="text-xs text-[#94A3B8] mb-1 block">Opis usterki</label>
                <textarea
                  value={defectDesc}
                  onChange={(e) => setDefectDesc(e.target.value)}
                  rows="3"
                  className="w-full bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded px-3 py-2 text-sm"
                  data-testid="public-defect-desc"
                />
              </div>
              <div>
                <label className="text-xs text-[#94A3B8] mb-1 block">Zdjecie (opcjonalnie, max 2MB)</label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoUpload}
                  className="text-xs text-[#CBD5E1]"
                  data-testid="public-defect-photo"
                />
                {defectPhoto && <img src={defectPhoto} alt="podglad" className="mt-2 max-h-28 rounded" />}
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="ghost" onClick={() => setShowDefectModal(false)}>
                  Anuluj
                </Button>
                <Button
                  onClick={submitDefect}
                  disabled={submitting}
                  className="bg-[#E8836A] hover:bg-[#C56A52] text-white"
                  data-testid="public-submit-defect-btn"
                >
                  {submitting ? 'Wysylanie...' : 'Wyslij'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
