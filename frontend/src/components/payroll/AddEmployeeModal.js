// iter95bf: AddEmployeeModal wyciągnięty z PayrollAdmin.js
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { ActionButton } from '../ui/action-button';
import { Input } from '../ui/input';
import { UserPlus } from 'lucide-react';

export const AddEmployeeModal = ({
  open, onOpenChange,
  newName, setNewName, newPhone, setNewPhone,
  nameInputRef, phoneInputRef,
  onAdd, onCancel,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="bg-[#243049] border-[#3D5378] text-[#F1F5F9]" data-testid="payroll-add-modal">
      <DialogHeader>
        <DialogTitle className="text-white">Dodaj pracownika</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <label className="text-sm text-[#CBD5E1] block mb-1">Imię i nazwisko</label>
          <Input
            ref={nameInputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Jan Kowalski"
            className="bg-[#1E2A44] border-[#3D5378] text-white"
            data-testid="payroll-add-name"
            autoFocus
          />
        </div>
        <div>
          <label className="text-sm text-[#CBD5E1] block mb-1">Telefon (opcjonalnie)</label>
          <Input
            ref={phoneInputRef}
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="+48..."
            className="bg-[#1E2A44] border-[#3D5378] text-white"
            data-testid="payroll-add-phone"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} className="border-[#3D5378] text-[#F1F5F9] hover:bg-[#3D5378] hover:text-white">
          Anuluj
        </Button>
        <ActionButton onAction={onAdd} className="bg-[#4F6343] hover:bg-[#3F5235] text-white" data-testid="payroll-add-submit">
          <UserPlus className="h-4 w-4 mr-1" /> Dodaj
        </ActionButton>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
