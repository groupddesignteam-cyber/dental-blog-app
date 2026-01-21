
import sys
import os
sys.path.append(os.getcwd())

from src.reporting.html_generator import generate_html_report

def test_generation():
    # Mock data based on the structure expected by prepare_department_data
    mock_results = {
        'reservation': {
            'kpi': {'total_reservations': 150, 'cancel_rate': 12.5},
            'charts': {'monthly_trend': [{'year_month': '2025-01', 'value': 100}, {'year_month': '2025-02', 'value': 150}]},
            'tables': {
                'inflow_top5': [{'inflow': 'Naver', 'count': 50}],
                'treatment_top5': [{'treatment': 'Implant', 'count': 30}],
                'cancel_reason_top5': [{'cancel_reason': 'Cost', 'count': 10}]
            }
        },
        'blog': {
            'kpi': {'total_views': 5000, 'views_mom_growth': 10.5},
            'charts': {'views_trend': [{'year_month': '2025-01', 'views': 4000}, {'year_month': '2025-02', 'views': 5000}]},
            'tables': {
                'work_summary': [{'clinic': 'Test Clinic', 'contract_item': 'Premium', 'status': 'Active', 'post_url': 'http://...', 'contract_count': 10, 'published_count': 8}],
                'views_top5': [{'title': 'Post 1', 'views': 1000, 'write_date': '2025-01-15'}],
                'traffic_top5': [{'source': 'Search', 'ratio': 80.0}]
            }
        },
        'ads': {
            'kpi': {'total_spend': 1000000, 'spend_mom_growth': 5.0},
            'charts': {'spend_trend': [{'year_month': '2025-01', 'spend': 900000}, {'year_month': '2025-02', 'spend': 1000000}]},
            'tables': {
                'keyword_top5_impressions': [{'keyword': 'Dentist', 'impressions': 5000}],
                'keyword_top5_clicks': [{'keyword': 'Dentist', 'clicks': 100}]
            }
        },
        'design': {
            'kpi': {'completed_tasks': 20, 'mom_growth': 2.0},
            'charts': {'monthly_trend': [{'year_month': '2025-01', 'count': 18}, {'year_month': '2025-02', 'count': 20}]},
            'tables': {
                'heavy_revision_tasks': [{'task_name': 'Banner', 'clinic': 'Test Clinic', 'revision_count': 5}],
                'clinic_task_count': [{'clinic': 'Test Clinic', 'total_tasks': 10}]
            }
        },
        'youtube': {
            'kpi': {'uploaded_videos': 5, 'completion_rate': 100.0},
            'charts': {'monthly_trend': [{'year_month': '2025-01', 'count': 4}, {'year_month': '2025-02', 'count': 5}]},
            'tables': {
                'work_summary': [{'clinic': 'Test Clinic', 'video_type': 'Shorts', 'content_details': 'Intro', 'contract_count': 5, 'completed_count': 5}],
                'top5_videos': [{'title': 'Video 1', 'views': 500}],
                'traffic_by_source': [{'source': 'Recommendation', 'views': 300}]
            }
        },
        'setting': {
            'kpi': {'avg_progress_rate': 85.0, 'completed_clinics': 5},
            'charts': {'progress_distribution': {'Completed': 5, 'In Progress': 2}},
            'tables': {
                'clinic_progress': [{'clinic': 'Test Clinic', 'marketing_start_date': '2025-01-01', 'contract_item': 'Full', 'platform_name': 'Naver', 'progress_rate': 100.0}],
                'channel_completion_rate': [{'channel': 'Blog', 'completion_rate': 90.0}]
            }
        }
    }

    try:
        html = generate_html_report(mock_results)
        print("Report generation successful!")
        print(f"Generated HTML length: {len(html)}")
        
        # Save to a temp file to inspect if needed
        with open("test_report.html", "w", encoding="utf-8") as f:
            f.write(html)
            
    except Exception as e:
        print(f"Report generation failed: {e}")
        raise

if __name__ == "__main__":
    test_generation()
