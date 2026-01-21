"""
Utility functions for the report generator
"""

import re
from dataclasses import dataclass
from typing import List, Optional, Dict, Any, Tuple
import pandas as pd
from io import BytesIO


@dataclass
class LoadedFile:
    """Represents a loaded file with optional DataFrame or raw bytes."""
    name: str
    df: Optional[pd.DataFrame] = None
    raw_bytes: Optional[bytes] = None


# File pattern to processor mapping
FILE_PATTERNS = {
    'ads': [
        r'945246_소진_내역_.*\.xlsx',
        r'캠페인.*보고서.*\.csv',
        r'캠페인 보고서.*\.csv'
    ],
    'design': [
        r'\[디자인팀\].*업무.*협조.*요청.*\.csv',
        r'디자인팀.*업무.*\.csv',
        r'\[디자인팀\].*업무.*협조.*요청.*\.xlsx',
        r'디자인팀.*업무.*\.xlsx',
        r'업무.*협조.*요청.*\.xlsx',
        r'업무.*협조.*요청.*\.csv'
    ],
    'reservation': [
        r'.*예약자관리.*\.xlsx',
        r'.*예약.*관리.*\.xlsx',
        r'.*상담.*\.xlsx'
    ],
    'blog': [
        r'\[콘텐츠팀\].*포스팅.*업무.*현황.*\.csv',
        r'콘텐츠팀.*포스팅.*\.csv',
        r'유입분석_월간_.*\.xlsx',
        r'조회수_순위_월간_.*\.xlsx',
        r'조회수_월간_.*\.xlsx'
    ],
    'youtube': [
        r'\[영상팀\].*업무.*현황.*\.csv',
        r'영상팀.*업무.*\.csv',
        r'.*유튜브.*콘텐츠.*DB.*\.xlsx',
        r'.*유튜브.*트래픽.*DB.*\.xlsx'
    ],
    'setting': [
        r'세팅KPI.*\.csv',
        r'세팅.*KPI.*\.csv'
    ]
}


def classify_file(filename: str) -> Optional[str]:
    """
    Classify a file by its name to determine which processor should handle it.

    Args:
        filename: The name of the file

    Returns:
        The processor name ('ads', 'design', etc.) or None if unrecognized
    """
    for processor_name, patterns in FILE_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, filename, re.IGNORECASE):
                return processor_name
    return None


def load_uploaded_file(uploaded_file) -> LoadedFile:
    """
    Load an uploaded file from Streamlit into a LoadedFile object.

    Args:
        uploaded_file: Streamlit UploadedFile object

    Returns:
        LoadedFile object with raw_bytes populated
    """
    raw_bytes = uploaded_file.read()
    uploaded_file.seek(0)  # Reset for potential re-read

    return LoadedFile(
        name=uploaded_file.name,
        raw_bytes=raw_bytes
    )


def route_files(uploaded_files: List) -> Dict[str, List[LoadedFile]]:
    """
    Route uploaded files to their respective processors.

    Args:
        uploaded_files: List of Streamlit UploadedFile objects or LoadedFile objects

    Returns:
        Dict mapping processor names to lists of LoadedFile objects
    """
    routed = {
        'ads': [],
        'design': [],
        'reservation': [],
        'blog': [],
        'youtube': [],
        'setting': []
    }

    for f in uploaded_files:
        # Handle both Streamlit UploadedFile and our LoadedFile
        filename = f.name

        processor = classify_file(filename)
        if processor:
            if isinstance(f, LoadedFile):
                loaded = f
            else:
                loaded = load_uploaded_file(f)
            routed[processor].append(loaded)

    return routed


def format_number(value: float, decimal_places: int = 0) -> str:
    """Format number with thousands separator."""
    if pd.isna(value):
        return "-"
    if decimal_places == 0:
        return f"{int(value):,}"
    return f"{value:,.{decimal_places}f}"


def format_percent(value: float, decimal_places: int = 1) -> str:
    """Format percentage value."""
    if pd.isna(value):
        return "-"
    return f"{value:.{decimal_places}f}%"


def format_currency(value: float) -> str:
    """Format currency value in Korean Won."""
    if pd.isna(value):
        return "-"
    return f"₩{int(value):,}"


def get_growth_delta(current: float, previous: float) -> Tuple[float, str]:
    """
    Calculate growth rate and return delta value with color indicator.

    Returns:
        Tuple of (delta_value, delta_color)
    """
    if previous == 0:
        return 0, "off"

    delta = ((current - previous) / previous) * 100
    return delta, "normal"


def safe_get(data: Dict, *keys, default=None):
    """Safely get nested dictionary values."""
    result = data
    for key in keys:
        if isinstance(result, dict):
            result = result.get(key, default)
        else:
            return default
    return result if result is not None else default
