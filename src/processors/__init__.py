"""
Processors Package
"""

from .ads import process_ads
from .design import process_design
from .reservation import process_reservation
from .blog import process_blog
from .youtube import process_youtube
from .setting import process_setting

__all__ = [
    'process_ads',
    'process_design',
    'process_reservation',
    'process_blog',
    'process_youtube',
    'process_setting'
]
