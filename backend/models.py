from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import Optional, List
from datetime import datetime, date
from enum import Enum


class UserRole(str, Enum):
    ADMIN = "admin"
    WORKER = "worker"
    FOREMAN = "foreman"


class RequestStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


# User Models
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    full_name: str
    role: UserRole
    email: Optional[str] = None
    hashed_password: Optional[str] = None
    employee_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now())


class UserCreate(BaseModel):
    full_name: str
    email: Optional[str] = None
    password: Optional[str] = None
    role: UserRole = UserRole.WORKER


class UserLogin(BaseModel):
    email: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict


# Employee Models
class Employee(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    full_name: str
    phone_number: Optional[str] = None
    user_id: Optional[str] = None
    currently_active: bool = True
    assigned_sites: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now())
    updated_at: datetime = Field(default_factory=lambda: datetime.now())
    sync_source: Optional[str] = None


class EmployeeCreate(BaseModel):
    full_name: str
    phone_number: Optional[str] = None


# Construction Site Models
class ConstructionSite(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    name: str
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    google_maps_url: Optional[str] = None
    is_active: bool = True
    excel_column: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now())
    month: Optional[str] = None
    category: Optional[str] = "budowa"  # budowa | sklep | magazyn | inne
    address: Optional[str] = None
    visible_to_foremen: bool = True


class SiteCreate(BaseModel):
    name: str
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    google_maps_url: Optional[str] = None
    month: Optional[str] = None
    category: Optional[str] = "budowa"
    address: Optional[str] = None
    visible_to_foremen: Optional[bool] = True


class SiteUpdate(BaseModel):
    name: Optional[str] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    google_maps_url: Optional[str] = None
    is_active: Optional[bool] = None
    category: Optional[str] = None
    address: Optional[str] = None
    visible_to_foremen: Optional[bool] = None


# Assignment Models
class EmployeeAssignment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    employee_id: str
    site_id: str
    month: str
    year: int
    assigned_dates: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now())
    created_by: str


class AssignmentCreate(BaseModel):
    employee_id: str
    site_id: str
    month: str
    year: int
    dates: Optional[List[str]] = None
    assign_full_month: bool = False


# Hour Entry Models
class HourEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    employee_id: str
    site_id: Optional[str] = None
    work_date: str
    hours_worked: float
    is_absent: bool = False
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now())
    created_by: str


class HourEntryCreate(BaseModel):
    employee_id: str
    site_id: Optional[str] = None
    work_date: str
    hours_worked: float = 0
    is_absent: bool = False
    notes: Optional[str] = None


# Hour Request Models
class HourRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    employee_id: str
    site_id: str
    work_date: str
    hours_worked: float
    reason: Optional[str] = None
    status: RequestStatus = RequestStatus.PENDING
    created_at: datetime = Field(default_factory=lambda: datetime.now())
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None


class HourRequestCreate(BaseModel):
    employee_id: str
    site_id: str
    work_date: str
    hours_worked: float
    reason: Optional[str] = None


class RequestReview(BaseModel):
    status: RequestStatus


# Sync Models
class ExcelSyncLog(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    sync_date: datetime = Field(default_factory=lambda: datetime.now())
    employees_synced: int = 0
    sites_synced: int = 0
    status: str = "success"
    error_message: Optional[str] = None


# Advance (Zaliczka) Models
class Advance(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    employee_id: str
    amount: float
    month: int
    year: int
    note: Optional[str] = None
    carried_from_month: Optional[int] = None
    carried_from_year: Optional[int] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now())


class AdvanceCreate(BaseModel):
    employee_id: str
    amount: float
    month: int
    year: int
    note: Optional[str] = None


class AdvanceCarryForward(BaseModel):
    amount: float
    target_month: int
    target_year: int


# Report Models
class MonthlyReport(BaseModel):
    month: str
    year: int
    site_reports: List[dict]
    total_hours: float


# Penalty (Kara) Models
class Penalty(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    employee_id: str
    amount: float
    month: int
    year: int
    description: Optional[str] = None
    image_data: Optional[str] = None  # base64 encoded image
    created_at: datetime = Field(default_factory=lambda: datetime.now())


class PenaltyCreate(BaseModel):
    employee_id: str
    amount: float
    month: int
    year: int
    description: Optional[str] = None
    image_data: Optional[str] = None



# Absence Models
class AbsenceCreate(BaseModel):
    dates: List[str]  # list of 'yyyy-MM-dd' strings

class Absence(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    employee_id: str
    dates: List[str]
    status: str = "pending"
    created_at: Optional[str] = None
    reviewed_at: Optional[str] = None
    reviewed_by: Optional[str] = None
