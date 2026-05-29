// iter95bc: wydzielony z Budget.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Calendar, X, ChevronLeft, FileBarChart, FilePlus, Receipt, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { ContractDataModal } from './ContractDataModal';

export const ProtokolDownloaderInline = ({ budowaId, year, month }) => {
  const [busy, setBusy] = useState(null);
  const [contractModal, setContractModal] = useState(null);

  const doDownload = async (fmt) => {
    setBusy(fmt);
    try {
      const url = fmt === 'pdf'
        ? `/budget/${budowaId}/protokol/${year}/${month}/pdf`
        : `/budget/${budowaId}/protokol/${year}/${month}`;
      const mime = fmt === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const res = await api.get(url, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: mime });
      const link = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = link;
      a.download = `Protokol_${year}-${String(month).padStart(2, '0')}.${fmt}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(link);
      toast.success(`Protokół ${fmt.toUpperCase()} wygenerowany`);
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
    } finally {
      setBusy(null);
    }
  };

  const download = async (fmt) => {
    setBusy(fmt);
    try {
      const check = await api.get(`/budget/${budowaId}/protokol-check`);
      if (!check.data.ready) {
        setBusy(null);
        setContractModal({ format: fmt, data: check.data.budowa });
        return;
      }
      await doDownload(fmt);
    } catch (e) {
      setBusy(null);
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => download('xlsx')} disabled={busy !== null}
        className="bg-[#4F6343] hover:bg-[#3F5235] text-white h-8" data-testid="protokol-download-xlsx-btn">
        <FileDown className="h-4 w-4 mr-1" />
        {busy === 'xlsx' ? 'Generuję...' : 'XLSX'}
      </Button>
      <Button size="sm" onClick={() => download('pdf')} disabled={busy !== null}
        className="bg-[#9B2C2C] hover:bg-[#7F2424] text-white h-8" data-testid="protokol-download-pdf-btn">
        <FileDown className="h-4 w-4 mr-1" />
        {busy === 'pdf' ? 'Generuję...' : 'PDF'}
      </Button>
      {contractModal && (
        <ContractDataModal
          budowaId={budowaId}
          initial={contractModal.data}
          onClose={() => setContractModal(null)}
          onSaved={async () => {
            const fmt = contractModal.format;
            setContractModal(null);
            await doDownload(fmt);
          }}
        />
      )}
    </>
  );
};

