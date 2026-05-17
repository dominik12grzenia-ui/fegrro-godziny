import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Warehouse } from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * /magazynier/:token — one-click login for magazynier without password.
 * Admin shares the URL; opening it exchanges the public token for a long-lived
 * JWT and drops the user straight into the warehouse dashboard.
 */
export default function WarehouseTokenEntry() {
  const { token } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/api/auth/warehouse/by-token/${token}`);
        if (cancelled) return;
        const { access_token, user_id, full_name } = res.data;
        localStorage.setItem('token', access_token);
        localStorage.setItem('user_id', user_id);
        localStorage.setItem('user_name', full_name);
        localStorage.setItem('user_role', 'warehouse');
        navigate('/magazynier/dashboard', { replace: true });
      } catch (err) {
        if (cancelled) return;
        toast.error(err.response?.data?.detail || 'Link nieprawidlowy lub uniewazniony');
        // Fall back to manual login page after 2s so user isn't stuck on a blank screen
        setTimeout(() => navigate('/magazynier', { replace: true }), 2000);
      }
    })();
    return () => { cancelled = true; };
  }, [token, navigate]);

  return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-4" data-testid="warehouse-token-entry">
      <div className="text-center">
        <div className="mx-auto mb-4 w-20 h-20 rounded-full bg-[#D4AF37]/20 flex items-center justify-center animate-pulse">
          <Warehouse className="h-10 w-10 text-[#D4AF37]" />
        </div>
        <p className="text-[#D4AF37] text-lg font-bold">Otwieranie panelu magazyniera...</p>
        <p className="text-[#94A3B8] text-sm mt-2">Trwa weryfikacja linku</p>
      </div>
    </div>
  );
}
