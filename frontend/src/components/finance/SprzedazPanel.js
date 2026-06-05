// iter95bc: wydzielony z Finance.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Calendar, X, ChevronLeft, FileBarChart, FilePlus, Receipt, Briefcase, AlertCircle, AlertTriangle, RefreshCw, Loader2, Download, Save, Mail, Send } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { InfoHeader, PL_MONTHS_SHORT, SPRZEDAZ_COL_INFO, fmtNum, fmtPct, useFinanceRefresh } from './_shared';

export const SprzedazPanel = ({ year }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [month, setMonth] = useState(0); // 0 = caly rok

  const fetchSprzedaz = useCallback(() => {
    const qs = month > 0 ? `?year=${year}&month=${month}` : `?year=${year}`;
    api.get(`/finance/sprzedaz${qs}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Błąd pobierania sprzedaży'))
      .finally(() => setLoading(false));
  }, [year, month]);

  useEffect(() => { fetchSprzedaz(); }, [fetchSprzedaz]);
  // iter95dq: auto-refresh po zmianie zapisu w innym panelu
  useFinanceRefresh(fetchSprzedaz);

  if (loading && !data) return <Card className="bg-[#243049] border-[#3D5378]"><CardContent className="p-6 text-[#CBD5E1]">Ładowanie...</CardContent></Card>;
  if (!data) return null;

  const { rows, totals } = data;

  return (
    <Card className="bg-[#243049] border-[#3D5378]">
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-white">
          Sprzedaż per budowa {year}{month > 0 ? ` - ${PL_MONTHS_SHORT[month-1]}` : ' (caly rok)'}
        </CardTitle>
        <div className="flex items-center gap-2">
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}
            className="bg-[#1E2A44] border border-[#3D5378] text-white rounded px-2 py-1 text-sm"
            data-testid="finance-sprzedaz-month">
            <option value="0">Caly rok</option>
            {PL_MONTHS_SHORT.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <Button variant="outline" onClick={() => setShowDetails(!showDetails)}
            className="border-[#4F6343] text-[#4F6343] hover:bg-[#3D5378] hover:text-[#4F6343]"
            data-testid="sprzedaz-toggle-details">
            {showDetails ? <><ChevronDown className="h-4 w-4 mr-1" /> Ukryj szczegóły</> : <><ChevronRight className="h-4 w-4 mr-1" /> Rozwin szczegóły (kol. E-X)</>}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm finance-grid-table" data-testid="finance-sprzedaz-table">
          <thead className="bg-[#1E2A44] text-[#CBD5E1] text-xs">
            <tr>
              <th className="p-2 text-left">#</th>
              <th className="p-2 text-left">Budowa</th>
              {showDetails && <>
                <InfoHeader label="Sprzedaż" info={SPRZEDAZ_COL_INFO['Sprzedaż']} className="p-2 text-right bg-[#1E2A44]/70 text-[#D4AF37]" />
                <InfoHeader label="KP" info={SPRZEDAZ_COL_INFO['KP']} className="p-2 text-right bg-[#1E2A44]/70 text-[#D4AF37]" />
                <InfoHeader label="KP-alok" info={SPRZEDAZ_COL_INFO['KP-alok']} className="p-2 text-right bg-[#1E2A44]/70 text-[#D4AF37]" />
                <InfoHeader label="KBB" info={SPRZEDAZ_COL_INFO['KBB']} className="p-2 text-right bg-[#1E2A44]/70 text-[#D4AF37]" />
                <InfoHeader label="KBB-alok" info={SPRZEDAZ_COL_INFO['KBB-alok']} className="p-2 text-right bg-[#1E2A44]/70 text-[#D4AF37]" />
                <InfoHeader label="Marża brutto" info={SPRZEDAZ_COL_INFO['Marża brutto']} className="p-2 text-right bg-[#1E2A44]/70 text-[#D4AF37]" />
                <InfoHeader label="%" info={SPRZEDAZ_COL_INFO['Marża brutto %']} className="p-2 text-right bg-[#1E2A44]/70 text-[#D4AF37]" />
                <InfoHeader label="KSB" info={SPRZEDAZ_COL_INFO['KSB']} className="p-2 text-right bg-[#1E2A44]/70 text-[#D4AF37]" />
                <InfoHeader label="KSP układy" info={SPRZEDAZ_COL_INFO['KSP układy']} className="p-2 text-right bg-[#1E2A44]/70 text-[#D4AF37]" />
                <InfoHeader label="Marża I" info={SPRZEDAZ_COL_INFO['Marża I']} className="p-2 text-right bg-[#1E2A44]/70 text-[#D4AF37]" />
                <InfoHeader label="%" info={SPRZEDAZ_COL_INFO['Marża I %']} className="p-2 text-right bg-[#1E2A44]/70 text-[#D4AF37]" />
                <InfoHeader label="KSP alok" info={SPRZEDAZ_COL_INFO['KSP alok']} className="p-2 text-right bg-[#1E2A44]/70 text-[#D4AF37]" />
                <InfoHeader label="Marża II" info={SPRZEDAZ_COL_INFO['Marża II']} className="p-2 text-right bg-[#1E2A44]/70 text-[#D4AF37]" />
                <InfoHeader label="%" info={SPRZEDAZ_COL_INFO['Marża II %']} className="p-2 text-right bg-[#1E2A44]/70 text-[#D4AF37]" />
                <InfoHeader label="Podatek alok" info={SPRZEDAZ_COL_INFO['Podatek alok']} className="p-2 text-right bg-[#1E2A44]/70 text-[#D4AF37]" />
                <InfoHeader label="Marża III" info={SPRZEDAZ_COL_INFO['Marża III']} className="p-2 text-right bg-[#1E2A44]/70 text-[#D4AF37]" />
                <InfoHeader label="%" info={SPRZEDAZ_COL_INFO['Marża III %']} className="p-2 text-right bg-[#1E2A44]/70 text-[#D4AF37]" />
              </>}
              {/* Y-AI visible */}
              <InfoHeader label="Przychod" info={SPRZEDAZ_COL_INFO['Przychod']} className="p-2 text-right text-[#4F6343] font-bold" />
              <InfoHeader label="Koszt" info={SPRZEDAZ_COL_INFO['Koszt']} className="p-2 text-right text-[#DC4A3A] font-bold" />
              <InfoHeader label="KGIR" info={SPRZEDAZ_COL_INFO['KGIR']} className="p-2 text-right" />
              <InfoHeader label="KDW" info={SPRZEDAZ_COL_INFO['KDW']} className="p-2 text-right" />
              <InfoHeader label="Różnica" info={SPRZEDAZ_COL_INFO['Różnica']} className="p-2 text-right text-[#D4AF37] font-bold" />
              <InfoHeader label="Zysk%" info={SPRZEDAZ_COL_INFO['Zysk%']} className="p-2 text-right" />
              <InfoHeader label="Godz." info={SPRZEDAZ_COL_INFO['Godz.']} className="p-2 text-right" />
              <InfoHeader label="Przych/Rg" info={SPRZEDAZ_COL_INFO['Przych/Rg']} className="p-2 text-right" />
              <InfoHeader label="Zysk/Rg" info={SPRZEDAZ_COL_INFO['Zysk/Rg']} className="p-2 text-right" />
              <InfoHeader label="Koszt/Rg" info={SPRZEDAZ_COL_INFO['Koszt/Rg']} className="p-2 text-right" />
              <InfoHeader label="Kszt zmienny" info={SPRZEDAZ_COL_INFO['Kszt zmienny']} className="p-2 text-right" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={showDetails ? 30 : 13} className="p-6 text-center text-[#CBD5E1]">Brak budow. Dodaj w zakladce Budowy.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.budowa_id} className="border-t border-[#3D5378] hover:bg-[#1E2A44]/50" data-testid={`sprzedaz-row-${r.budowa_id}`}>
                <td className="p-2 text-[#CBD5E1]">{r.nr}</td>
                <td className="p-2 text-white font-medium">{r.name}{r.is_archived && <span className="ml-1 text-xs text-[#CBD5E1]">(arch)</span>}</td>
                {showDetails && <>
                  <td className="p-2 text-right text-xs text-[#F1F5F9] bg-[#1E2A44]/30">{fmtNum(r.details.sprzedaz)}</td>
                  <td className="p-2 text-right text-xs text-[#F1F5F9] bg-[#1E2A44]/30">{fmtNum(r.details.kp)}</td>
                  <td className="p-2 text-right text-xs text-[#CBD5E1] bg-[#1E2A44]/30">{fmtNum(r.details.kp_aloc)}</td>
                  <td className="p-2 text-right text-xs text-[#F1F5F9] bg-[#1E2A44]/30">{fmtNum(r.details.kbb)}</td>
                  <td className="p-2 text-right text-xs text-[#CBD5E1] bg-[#1E2A44]/30">{fmtNum(r.details.kbb_aloc)}</td>
                  <td className="p-2 text-right text-xs text-[#4F6343] bg-[#1E2A44]/30">{fmtNum(r.details.marza_brutto)}</td>
                  <td className="p-2 text-right text-xs text-[#4F6343] bg-[#1E2A44]/30">{fmtPct(r.details.marza_brutto_pct)}</td>
                  <td className="p-2 text-right text-xs text-[#F1F5F9] bg-[#1E2A44]/30">{fmtNum(r.details.ksb)}</td>
                  <td className="p-2 text-right text-xs text-[#CBD5E1] bg-[#1E2A44]/30">{fmtNum(r.details.ksp_uklady_aloc)}</td>
                  <td className="p-2 text-right text-xs text-[#4F6343] bg-[#1E2A44]/30">{fmtNum(r.details.marza1)}</td>
                  <td className="p-2 text-right text-xs text-[#4F6343] bg-[#1E2A44]/30">{fmtPct(r.details.marza1_pct)}</td>
                  <td className="p-2 text-right text-xs text-[#CBD5E1] bg-[#1E2A44]/30">{fmtNum(r.details.ksp_aloc)}</td>
                  <td className="p-2 text-right text-xs text-[#4F6343] bg-[#1E2A44]/30">{fmtNum(r.details.marza2)}</td>
                  <td className="p-2 text-right text-xs text-[#4F6343] bg-[#1E2A44]/30">{fmtPct(r.details.marza2_pct)}</td>
                  <td className="p-2 text-right text-xs text-[#CBD5E1] bg-[#1E2A44]/30">{fmtNum(r.details.podatek_aloc)}</td>
                  <td className="p-2 text-right text-xs text-[#4F6343] bg-[#1E2A44]/30">{fmtNum(r.details.marza3)}</td>
                  <td className="p-2 text-right text-xs text-[#4F6343] bg-[#1E2A44]/30">{fmtPct(r.details.marza3_pct)}</td>
                </>}
                <td className="p-2 text-right text-[#4F6343] font-semibold">{fmtNum(r.visible.przychod)}</td>
                <td className="p-2 text-right text-[#DC4A3A] font-semibold">{fmtNum(r.visible.koszt)}</td>
                <td className="p-2 text-right text-xs text-[#CBD5E1]">{fmtNum(r.visible.kaucja_gir)}</td>
                <td className="p-2 text-right text-xs text-[#CBD5E1]">{fmtNum(r.visible.kaucja_dw)}</td>
                <td className="p-2 text-right text-[#D4AF37] font-bold">{fmtNum(r.visible.roznica)}</td>
                <td className="p-2 text-right text-xs">{fmtPct(r.visible.zysk_pct)}</td>
                <td className="p-2 text-right text-xs">{fmtNum(r.visible.godziny)}</td>
                <td className="p-2 text-right text-xs">{fmtNum(r.visible.przychod_rg)}</td>
                <td className="p-2 text-right text-xs">{fmtNum(r.visible.zysk_rg)}</td>
                <td className="p-2 text-right text-xs">{fmtNum(r.visible.koszt_rg)}</td>
                <td className="p-2 text-right text-xs">{fmtNum(r.visible.koszt_zmienny)}</td>
              </tr>
            ))}
            {/* SUMA footer */}
            {rows.length > 0 && (
              <tr className="border-t-2 border-[#4F6343] bg-[#1E2A44]" data-testid="sprzedaz-totals-row">
                <td className="p-2 text-white font-bold" colSpan={2}>SUMA</td>
                {showDetails && totals.details && <>
                  <td className="p-2 text-right text-[#F1F5F9] font-semibold bg-[#1E2A44]">{fmtNum(totals.details.sprzedaz)}</td>
                  <td className="p-2 text-right text-[#F1F5F9] font-semibold bg-[#1E2A44]">{fmtNum(totals.details.kp)}</td>
                  <td className="p-2 text-right text-[#CBD5E1] font-semibold bg-[#1E2A44]">{fmtNum(totals.details.kp_aloc)}</td>
                  <td className="p-2 text-right text-[#F1F5F9] font-semibold bg-[#1E2A44]">{fmtNum(totals.details.kbb)}</td>
                  <td className="p-2 text-right text-[#CBD5E1] font-semibold bg-[#1E2A44]">{fmtNum(totals.details.kbb_aloc)}</td>
                  <td className="p-2 text-right text-[#4F6343] font-bold bg-[#1E2A44]">{fmtNum(totals.details.marza_brutto)}</td>
                  <td className="p-2 text-right text-[#4F6343] font-semibold bg-[#1E2A44]">{fmtPct(totals.details.marza_brutto_pct)}</td>
                  <td className="p-2 text-right text-[#F1F5F9] font-semibold bg-[#1E2A44]">{fmtNum(totals.details.ksb)}</td>
                  <td className="p-2 text-right text-[#CBD5E1] font-semibold bg-[#1E2A44]">{fmtNum(totals.details.ksp_uklady_aloc)}</td>
                  <td className="p-2 text-right text-[#4F6343] font-bold bg-[#1E2A44]">{fmtNum(totals.details.marza1)}</td>
                  <td className="p-2 text-right text-[#4F6343] font-semibold bg-[#1E2A44]">{fmtPct(totals.details.marza1_pct)}</td>
                  <td className="p-2 text-right text-[#CBD5E1] font-semibold bg-[#1E2A44]">{fmtNum(totals.details.ksp_aloc)}</td>
                  <td className="p-2 text-right text-[#4F6343] font-bold bg-[#1E2A44]">{fmtNum(totals.details.marza2)}</td>
                  <td className="p-2 text-right text-[#4F6343] font-semibold bg-[#1E2A44]">{fmtPct(totals.details.marza2_pct)}</td>
                  <td className="p-2 text-right text-[#CBD5E1] font-semibold bg-[#1E2A44]">{fmtNum(totals.details.podatek_aloc)}</td>
                  <td className="p-2 text-right text-[#4F6343] font-bold bg-[#1E2A44]">{fmtNum(totals.details.marza3)}</td>
                  <td className="p-2 text-right text-[#4F6343] font-semibold bg-[#1E2A44]">{fmtPct(totals.details.marza3_pct)}</td>
                </>}
                <td className="p-2 text-right text-[#4F6343] font-bold">{fmtNum(totals.visible.przychod)}</td>
                <td className="p-2 text-right text-[#DC4A3A] font-bold">{fmtNum(totals.visible.koszt)}</td>
                <td className="p-2 text-right text-[#CBD5E1]">{fmtNum(totals.visible.kaucja_gir)}</td>
                <td className="p-2 text-right text-[#CBD5E1]">{fmtNum(totals.visible.kaucja_dw)}</td>
                <td className="p-2 text-right text-[#D4AF37] font-bold">{fmtNum(totals.visible.roznica)}</td>
                <td className="p-2 text-right">{fmtPct(totals.visible.zysk_pct)}</td>
                <td className="p-2 text-right">{fmtNum(totals.visible.godziny)}</td>
                <td className="p-2 text-right">{fmtNum(totals.visible.przychod_rg)}</td>
                <td className="p-2 text-right">{fmtNum(totals.visible.zysk_rg)}</td>
                <td className="p-2 text-right">{fmtNum(totals.visible.koszt_rg)}</td>
                <td className="p-2 text-right">{fmtNum(totals.visible.koszt_zmienny)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
};

