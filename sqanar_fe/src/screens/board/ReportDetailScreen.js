// src/screens/board/ReportDetailScreen.js
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import apiClient from '../../../api/apiClient';
import { useSettings } from '../../state/useSettings';
import { useNavigation } from '@react-navigation/native';
import CustomText from '../../../CustomText';

const STATUS_OPTIONS_ADMIN = [
  { key: 'MALICIOUS', label: '악성', color: '#EF4444', action: 'malicious' }, 
  { key: 'LEGITIMATE', label: '정상', color: '#2c67ff', action: 'legitimate' }, 
  { key: 'PENDING_close', label: '확인 중 (닫기)', color: '#9CA3AF', action: 'pending_close' }, // 닫기
];

function StatusChip({ status, baseFont }) {
  const txt = String(status);
  const isApproved = /정상|legitimate|승인|채택|approve|확정|검증됨/i.test(txt);
  const isMalicious = /악성|malicious|거절|reject/i.test(txt);
  const bg = isApproved ? '#DCFCE7' : isMalicious ? '#FEE2E2' : '#FEF9C3';
  const color = isApproved ? '#166534' : isMalicious ? '#991B1B' : '#92400E';
  return (
    <View style={[detailStyles.chip, { backgroundColor: bg }]}>
      <CustomText style={[detailStyles.chipText, { color, fontSize: Math.max(11, baseFont - 3) }]}>{txt}</CustomText>
    </View>
  );
}

export default function ReportDetailScreen({ route }) {
  const navigation = useNavigation();
  const { reportId, url: initialUrl } = route.params;
  const { palette, baseFont } = useSettings();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const isAdmin = userRole === 'ADMIN'; 

  const dyn = useMemo(() => ({
    bg: { backgroundColor: palette.bg },
    card: { backgroundColor: palette.card, borderColor: palette.border },
    text: { color: palette.text, fontSize: baseFont },
    sub: { color: palette.sub, fontSize: Math.max(12, baseFont - 2) },
    input: { color: palette.text, borderColor: palette.border, backgroundColor: palette.card },
  }), [palette, baseFont]);

    useEffect(() => {
        const fetchRole = async () => {
            try {
                const res = await apiClient.get('/auth/me');
                setUserRole(res.data.role);
            } catch (e) {
                console.error("Failed to fetch user role:", e);
                setUserRole(null);
            } finally {
                setAuthLoading(false);
            }
        };
        fetchRole();
    }, []);

  const handleAnalyze = useCallback(async () => {
    setAnalysisLoading(true);
    setError('');
    setAnalysis(null); 
    try {
      const res = await apiClient.get(`/board/report/${reportId}/analyze`);
      if (res.data.ok && res.data.analysis) {
        setAnalysis(res.data.analysis);

        const resultText = res.data.analysis.text_result;
        Alert.alert('분석 완료', resultText.replace(/\*\*/g, '')); 
      } else {
        throw new Error(res.data.message || '분석 실패');
      }
    } catch (e) {
      console.error('모델 분석 실패:', e.response?.data?.message || e);
      Alert.alert('분석 오류', `모델 분석에 실패했습니다. ${e.response?.data?.message || '네트워크 오류'}`);
    } finally {
      setAnalysisLoading(false);
    }
  }, [reportId]);

  const fetchReportDetails = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get(`/board/report/${reportId}/analyze`);
      const data = res.data;

      if (data.ok && data.url) { 
          setReport({
              id: data.id || reportId,
              url: data.url || initialUrl,
              domain: data.domain || '도메인 정보 없음',
              reason: data.reason || '사유 없음',
              status: data.status || '확인중',
              reporter_nick: data.reporter_nick || '익명',
              created_at: data.created_at, 
              status_updated_at: data.status_updated_at,
              judgment: data.judgment,
              confidence: data.confidence,
            });
          setAnalysis(data.analysis || null); 
      } else {
         throw new Error(data.message || '서버 응답에서 URL 정보를 찾을 수 없습니다.');
      }
    } catch (e) {
      console.error('신고 상세 정보 불러오기 실패:', e.response?.data?.message || e);
      const errMsg = e.response?.data?.message || '네트워크 또는 서버 오류';
      setError(`신고 상세 정보를 불러오지 못했습니다. (${errMsg})`);
    } finally {
      setLoading(false);
    }
  }, [reportId, initialUrl]);

  useEffect(() => {
    fetchReportDetails();
  }, [fetchReportDetails]);

  const handleAdminStatusChange = async (action) => {
    let judgment;
    let statusKor;
    let confidence = null; 

    switch (action) {
      case 'malicious':
        judgment = 'MALICIOUS';
        statusKor = '악성';
        confidence = analysis?.confidence || 1.0; 
        break;
      case 'legitimate':
        judgment = 'LEGITIMATE';
        statusKor = '정상';
        confidence = analysis?.confidence || 1.0; 
        break;
      case 'pending_close': 
        navigation.goBack(); 
        return;
      default: return;
    }

    const confirmMessage = 
      action === 'malicious' ? '악성으로 확정하고 목록에 반영하시겠습니까?' :
      '정상으로 확정하고 심사를 종료하시겠습니까?';

    Alert.alert(
      '상태 변경 확인',
      confirmMessage,
      [
        { text: '취소', style: 'cancel' },
        {
          text: statusKor,
          style: action === 'malicious' ? 'destructive' : 'default',
          onPress: async () => {
          setActionLoading(true);
          try {
              await apiClient.post(`/board/report/${reportId}/judgment`, {
              judgment: judgment, 
              confidence: confidence,
            });
              setReport(prev => ({ ...prev, status: statusKor, judgment: judgment, confidence: confidence, status_updated_at: new Date().toISOString() }));
              Alert.alert('성공', `신고 상태가 '${statusKor}'로 변경되었습니다.`);
              navigation.goBack();
             } catch (e) {
              console.error('신고 상태 업데이트 실패:', e.response?.data?.message || e);
              Alert.alert('오류', `상태 변경에 실패했습니다. ${e.response?.data?.message || '네트워크 오류'}`);
             } finally {
             setActionLoading(false);
           }
         }
       }
     ]
    );
  };

  if (loading || authLoading) { 
        return (
            <SafeAreaView style={[detailStyles.safe, detailStyles.center, dyn.bg]}>
                <ActivityIndicator size="large" color={palette.text} />
                <CustomText style={[dyn.sub, { marginTop: 10 }]}>
                   {authLoading ? '권한 확인 중...' : '상세 정보 로딩 중...'}
                </CustomText>
            </SafeAreaView>
        );
    }

  if (error) {
    return (
      <SafeAreaView style={[detailStyles.safe, detailStyles.center, dyn.bg]}>
        <CustomText style={[dyn.text, detailStyles.errorText]}>{error}</CustomText>
        <TouchableOpacity style={{ marginTop: 20 }} onPress={fetchReportDetails}>
            <CustomText style={{ color: '#2c67ff' }}>다시 시도</CustomText>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!report && !loading) {
    return (
      <SafeAreaView style={[detailStyles.safe, detailStyles.center, dyn.bg]}>
        <CustomText style={[dyn.text, detailStyles.errorText]}>{error || '신고 정보를 찾을 수 없습니다.'}</CustomText>
        <TouchableOpacity style={{ marginTop: 20 }} onPress={fetchReportDetails}>
            <CustomText style={{ color: '#2c67ff' }}>다시 시도</CustomText>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const formatDate = (dateString) => {
    if (!dateString || typeof dateString !== 'string') return '정보 없음'; 
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '정보 없음'; 
    return date.toLocaleDateString('ko-KR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
    });
  };

  const currentStatusKey = String(report.status).toUpperCase();
  const isFinalStatus = currentStatusKey === 'APPROVED' || currentStatusKey === 'REJECTED';

  return (
    <SafeAreaView style={[detailStyles.safe, dyn.bg]}>
      {/* 헤더 */}
      <View style={[detailStyles.header, { borderColor: palette.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={28} color={dyn.text.color} />
        </TouchableOpacity>
        <CustomText style={[detailStyles.title, dyn.text]}>신고 상세 정보</CustomText>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView style={detailStyles.content} contentContainerStyle={{ paddingBottom: 20 }}>
        {/* URL 정보 카드 */}
        <View style={[detailStyles.card, dyn.card]}>
          <CustomText style={[detailStyles.urlLabel, dyn.sub]}>신고 URL</CustomText>
          <CustomText selectable={true} style={[detailStyles.urlText, dyn.text]}>{report.url || initialUrl}</CustomText>
          <CustomText style={[detailStyles.domainText, dyn.sub]}>{report.domain || '도메인 정보 없음'}</CustomText>
        </View>

        {/* 신고 상세 내역 카드 */}
        <View style={[detailStyles.card, dyn.card]}>
          <DetailRow label="신고 사유" value={report.reason || '사유 없음'} dyn={dyn} />
          <DetailRow label="신고 상태" dyn={dyn}>
            <StatusChip status={report.status || '확인중'} baseFont={baseFont} />
          </DetailRow>
          <DetailRow label="신고 일시" value={formatDate(report.created_at)} dyn={dyn} />
          <DetailRow label="신고 사용자" value={report.reporter_nick || '익명'} dyn={dyn} />
          {report.status_updated_at && (
            <DetailRow label="상태 변경 일시" value={formatDate(report.status_updated_at)} dyn={dyn} />
          )}
        </View>

        {/*모델 분석 결과 확인 버튼 및 결과 표시 (2-1) */}
        {isAdmin && (
            <View style={[detailStyles.actionsContainer, dyn.card, { marginTop: 15, padding: 12 }]}>
              <CustomText style={[detailStyles.actionTitle, dyn.text, { marginBottom: 10 }]}>
                URLBERT 모델 분석 결과
              </CustomText>
              {analysisLoading ? (
                <ActivityIndicator color={dyn.text.color} size="small" />
             ) : analysis ? (
                <View style={detailStyles.analysisResult}>
                  <CustomText style={{ color: '#111827', fontSize: baseFont }}>
                    {analysis.text_result}
                  </CustomText>
                </View>
              ) : (
                <TouchableOpacity 
                  style={[detailStyles.analyzeButton, { backgroundColor: '#3b82f6' }]}
                  onPress={handleAnalyze} // 2-1-1. 버튼 클릭 시 모델 분석 실행
                  disabled={analysisLoading}
                >
                  <CustomText style={detailStyles.analyzeButtonText}>모델 분석 결과 확인하기</CustomText>
                </TouchableOpacity>
              )}
            </View>
        )}

        {/* 관리자 상태 변경 버튼 영역 (1-1) */}
        {isAdmin && !isFinalStatus && (
          <View style={[detailStyles.actionsContainer, dyn.card]}>
            <CustomText style={[detailStyles.actionTitle, dyn.text]}>관리자 최종 상태 결정</CustomText>
            <View style={detailStyles.buttonRow}>
              {STATUS_OPTIONS_ADMIN.map(opt => ( 
                <TouchableOpacity
                  key={opt.key}
                  style={[detailStyles.actionButton, { 
                        backgroundColor: opt.color, 
                        flex: opt.key === 'PENDING_CLOSE' ? 0.8 : 1.2,
                    }]} 
                  onPress={() => handleAdminStatusChange(opt.action)}
                  disabled={actionLoading}
                  activeOpacity={0.8}
                >
                  {actionLoading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <CustomText style={detailStyles.actionButtonText}>{opt.label}</CustomText>
                  )}
                </TouchableOpacity>
              ))}
            </View>
             {actionLoading && <CustomText style={[dyn.sub, { marginTop: 10 }]}>처리 중...</CustomText>}
        </View>
      )}

        {/* 관리자이며 이미 최종 상태인 경우 */}
        {isAdmin && isFinalStatus && (
            <View style={[detailStyles.actionsContainer, dyn.card]}>
                 <CustomText style={[detailStyles.actionTitle, dyn.sub]}>
                    이미 최종 상태({report.status})로 처리되었습니다.
                 </CustomText>
            </View>
        )}

        {/* 관리자가 아닌 경우 */}
        {!isAdmin && (
             <View style={[detailStyles.actionsContainer, dyn.card]}>
                 <CustomText style={[detailStyles.actionTitle, dyn.sub]}>
                    관리자만 상태를 변경할 수 있습니다.
                 </CustomText>
            </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// 상세 정보 행을 위한 헬퍼 컴포넌트
const DetailRow = ({ label, value, children, dyn }) => (
  <View style={detailStyles.detailRow}>
    <CustomText style={[detailStyles.detailLabel, dyn.sub]}>{label}</CustomText>
    {children || <CustomText selectable={true} style={[detailStyles.detailValue, dyn.text]}>{value}</CustomText>}
  </View>
);

const detailStyles = StyleSheet.create({
  safe: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  errorText: { textAlign: 'center', fontWeight: 'bold', color: '#B42318' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontWeight: '700' },
  content: { flex: 1, paddingHorizontal: 16 },
  card: {
    borderRadius: 12,
    padding: 16,
    marginTop: 15,
    borderWidth: 1,
  },
  urlLabel: { fontWeight: '600', marginBottom: 4 },
  urlText: { fontWeight: '700', wordBreak: 'break-all' },
  domainText: { marginTop: 4 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
  },
  detailLabel: { fontWeight: '600' },
  detailValue: { flex: 1, textAlign: 'right', marginLeft: 10 },
  chip: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignSelf: 'flex-end'
  },
  chipText: { fontWeight: '800' }, 
  actionsContainer: {
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  actionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 15, textAlign: 'center' }, // 💡 dyn.text로 처리하기 위해 제거
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: { color: '#ffffff', fontWeight: '700' },
  analyzeButton: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: 5,
  },
  analyzeButtonText: { color: '#ffffff', fontWeight: '700' },
  analysisResult: {
    padding: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 5,
  }
});