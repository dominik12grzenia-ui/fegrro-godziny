import React from 'react';
import { api } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Clock, CheckCircle, XCircle, AlertTriangle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export const RequestsTab = ({
  requests,
  employees,
  sites,
  notifications,
  absenceRequests,
  setAbsenceRequests,
  handleApproveRequest,
  handleRejectRequest,
  fetchData,
}) => {
  return (
    <div className="space-y-4">
      <Card className="bg-[#2A384C] border-[#334155]">
        <CardHeader>
          <CardTitle className="text-[#CBD5E1]">Prośby o uzupełnienie godzin</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {requests.map((request) => {
              const employee = employees.find((e) => e.id === request.employee_id);
              const site = sites.find((s) => s.id === request.site_id);
              return (
                <div key={request.id} className="border rounded-lg p-4 bg-[#2A384C] border-[#334155]">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-[#5F7151] shrink-0" />
                        <span className="font-semibold text-[#CBD5E1] truncate">
                          {employee?.full_name || 'Nieznany pracownik'}
                        </span>
                      </div>
                      <div className="text-sm text-[#94A3B8] space-y-1">
                        <p><strong className="text-[#CBD5E1]">Budowa:</strong> {site?.name || 'Nieznana'}</p>
                        <p><strong className="text-[#CBD5E1]">Data:</strong> {request.work_date}</p>
                        <p><strong className="text-[#CBD5E1]">Godziny:</strong> {request.hours_worked}h</p>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        onClick={() => handleApproveRequest(request.id)}
                        size="sm"
                        className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
                        data-testid={`approve-request-${request.id}`}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Zatwierdź
                      </Button>
                      <Button
                        onClick={() => handleRejectRequest(request.id)}
                        size="sm"
                        variant="outline"
                        className="border-red-600 text-red-600 hover:bg-red-900"
                        data-testid={`reject-request-${request.id}`}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Odrzuć
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
            {requests.length === 0 && (
              <div className="text-center p-8 text-[#94A3B8]">Brak oczekujacych prosb</div>
            )}
          </div>
        </CardContent>
      </Card>

      {notifications.length > 0 && (
        <Card className="bg-[#2A384C] border-[#334155]">
          <CardHeader>
            <CardTitle className="text-[#E8836A] flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Godziny powyzej 10h — do akceptacji ({notifications.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {notifications.map((notif) => (
                <div key={notif.id} className="p-4 bg-[#1E293B] rounded-lg border border-[#E8836A]/30">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[#CBD5E1] font-semibold">{notif.employee_name}</p>
                      <p className="text-sm text-[#94A3B8]">
                        Data: <strong className="text-[#CBD5E1]">{notif.work_date}</strong> |{' '}
                        Godziny: <strong className="text-[#E8836A]">{notif.hours_worked}h</strong>
                      </p>
                      <p className="text-xs text-[#64748B] mt-1">
                        Wpisal: {notif.created_by_name} | {new Date(notif.created_at).toLocaleString('pl-PL')}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={async () => {
                          try {
                            await api.post(`/notifications/${notif.id}/approve`);
                            toast.success('Zatwierdzono');
                            fetchData();
                          } catch { toast.error('Błąd'); }
                        }}
                        size="sm"
                        className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
                        data-testid={`approve-notif-${notif.id}`}
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={async () => {
                          try {
                            await api.post(`/notifications/${notif.id}/reject`);
                            toast.success('Odrzucono');
                            fetchData();
                          } catch { toast.error('Błąd'); }
                        }}
                        size="sm"
                        variant="outline"
                        className="border-red-600 text-red-600 hover:bg-red-900"
                        data-testid={`reject-notif-${notif.id}`}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {absenceRequests.length > 0 && (
        <Card className="bg-[#2A384C] border-[#334155]">
          <CardContent className="pt-4">
            <h3 className="text-[#CBD5E1] font-bold mb-4 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-[#E8836A]" />
              Nieobecności — do akceptacji ({absenceRequests.length})
            </h3>
            <div className="space-y-3">
              {absenceRequests.map((absence) => (
                <div key={absence.id} className="p-4 bg-[#1E293B] rounded-lg border-2 border-[#7F2D2D]">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <p className="text-[#CBD5E1] font-semibold text-base">{absence.employee_name || 'Pracownik'}</p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={async () => {
                            try {
                              await api.put(`/absences/${absence.id}/review`, { status: 'approved' });
                              toast.success('Nieobecnosc zatwierdzona');
                              setAbsenceRequests((prev) => prev.filter((a) => a.id !== absence.id));
                            } catch { toast.error('Błąd'); }
                          }}
                          className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
                          data-testid={`approve-absence-${absence.id}`}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" /> Zatwierdz
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              await api.put(`/absences/${absence.id}/review`, { status: 'rejected' });
                              toast.success('Nieobecnosc odrzucona');
                              setAbsenceRequests((prev) => prev.filter((a) => a.id !== absence.id));
                            } catch { toast.error('Błąd'); }
                          }}
                          className="border-red-600 text-red-600 hover:bg-red-900"
                          data-testid={`reject-absence-${absence.id}`}
                        >
                          <XCircle className="h-4 w-4 mr-1" /> Odrzuc
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {absence.dates.map((d) => (
                        <span key={d} className="px-2 py-1 rounded bg-[#7F2D2D]/40 border border-[#7F2D2D] text-[#FCA5A5] text-sm font-medium">
                          {d}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-[#64748B]">
                      Zgloszone: {absence.created_at ? new Date(absence.created_at).toLocaleString('pl-PL') : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RequestsTab;
