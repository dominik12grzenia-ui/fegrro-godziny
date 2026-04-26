from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime
import uuid
import os

from database import db
from models import ConstructionSite, SiteCreate, SiteUpdate
from auth import get_current_user, get_current_admin

router = APIRouter()


@router.get("/sites", response_model=List[ConstructionSite])
async def get_sites(
    active_only: bool = True,
    month: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if active_only:
        query["is_active"] = True
    if month:
        query["month"] = month
    
    sites = await db.construction_sites.find(
        query,
        {
            "_id": 0,
            "id": 1, "name": 1, "location_lat": 1, "location_lng": 1,
            "google_maps_url": 1, "is_active": 1, "month": 1,
            "excel_column": 1, "created_at": 1, "category": 1, "address": 1,
            "visible_to_foremen": 1
        }
    ).to_list(1000)
    return sites


@router.post("/sites", response_model=ConstructionSite)
async def create_site(
    site: SiteCreate,
    current_user: dict = Depends(get_current_admin)
):
    site_id = str(uuid.uuid4())
    site_doc = {
        "id": site_id,
        "name": site.name,
        "location_lat": site.location_lat,
        "location_lng": site.location_lng,
        "google_maps_url": site.google_maps_url,
        "is_active": True,
        "month": site.month,
        "category": site.category or "budowa",
        "address": site.address,
        "visible_to_foremen": site.visible_to_foremen if site.visible_to_foremen is not None else True,
        "created_at": datetime.now().isoformat()
    }
    
    await db.construction_sites.insert_one(site_doc)
    site_doc.pop("_id", None)
    return ConstructionSite(**site_doc)


@router.put("/sites/{site_id}", response_model=ConstructionSite)
async def update_site(
    site_id: str,
    site_update: SiteUpdate,
    current_user: dict = Depends(get_current_admin)
):
    update_data = {k: v for k, v in site_update.model_dump().items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    result = await db.construction_sites.update_one(
        {"id": site_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Site not found")
    
    site = await db.construction_sites.find_one({"id": site_id}, {"_id": 0})
    return ConstructionSite(**site)


@router.delete("/sites/{site_id}")
async def delete_site(
    site_id: str,
    permanent: bool = False,
    current_user: dict = Depends(get_current_admin)
):
    if permanent:
        result = await db.construction_sites.delete_one({"id": site_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Site not found")
        # Also clean up assignments referencing this site
        await db.assignments.delete_many({"site_id": site_id})
        return {"message": "Site deleted permanently"}
    result = await db.construction_sites.update_one(
        {"id": site_id},
        {"$set": {"is_active": False}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Site not found")
    
    return {"message": "Site deactivated successfully"}


@router.get("/geocode")
async def geocode_address(address: str, current_user: dict = Depends(get_current_user)):
    api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Google Maps API key not configured")
    
    import requests as req
    resp = req.get(
        "https://maps.googleapis.com/maps/api/geocode/json",
        params={"address": address, "key": api_key}
    )
    data = resp.json()
    if data.get("status") != "OK" or not data.get("results"):
        raise HTTPException(status_code=400, detail=f"Geocoding failed: {data.get('status')}")
    
    result = data["results"][0]
    loc = result["geometry"]["location"]
    return {
        "lat": loc["lat"],
        "lng": loc["lng"],
        "formatted_address": result.get("formatted_address", address)
    }
