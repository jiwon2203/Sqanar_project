import React, { useEffect, useState, useRef, useCallback } from "react";
import { 
  View, Text, StyleSheet, TouchableOpacity, Alert, Modal, Linking, ActivityIndicator, Share, Dimensions,
} from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Camera, useCameraDevices, useCodeScanner,
} from "react-native-vision-camera";
import TextRecognition from "@react-native-ml-kit/text-recognition";
import { useNavigation, NavigationProp, useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import WebViewCard from "../components/WebviewCard";
import apiClient from '../../api/apiClient';
import {sendChat} from '../../api/chat';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const extractDomain = (url: string) => {
  try {
    const hostname = new URL(url).hostname;
    // const urlObject = new URL(url) as any;
    // const hostname = urlObject.hostname;
    return hostname.startsWith('www.') ? hostname.substring(4) : hostname;
  } catch (e){
    return url;
  }
}

const SCAN_BOX_SIZE = 250;
const SCAN_BOX_TOP = (SCREEN_HEIGHT / 2) - (SCAN_BOX_SIZE / 2);

const RESULT_AREA_TOP = SCREEN_HEIGHT * 0.25;

type RootStackParamList = {
  QRCamera: undefined;
  WebView: { url: string };
};

export default function QRCameraScreen(): React.JSX.Element{
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const devices = useCameraDevices();
  const device = devices.find((d) => d.position === "back");
  const camera = useRef<Camera>(null);

  const [hasPermission, setHasPermission] = useState(false);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [mode, setMode] = useState<"QR" | "URL">("QR");
  const [loading, setLoading] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [isSafe, setIsSafe] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  // webview
  const [showWebView, setShowWebView] = useState(false);
  const [summaryAnalysis, setSummaryAnalysis] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);

   const resetState = useCallback(() => {
    setScannedCode(null);
    setShowActionsMenu(false);
    setIsSafe(false);
    setAnalysisResult(null);
    setLoading(false);
    setShowWebView(false);
    setSummaryAnalysis(null);
    setShowSummary(false)
  }, []);

  useFocusEffect(
    useCallback(() => {
      resetState();
      return () => {
      };
    }, [resetState])
  );

  const requestSummaryAnalysis = useCallback(async (url: string, result: any) => {
    try {
      // 챗봇 API 호출 시 'summary_request' 메타데이터를 포함
      const chatResponse = await sendChat({ 
        message: `이 악성 URL '${url}'이 위험한 주된 이유를 한 가지, 짧고 간결하게 분석해 줘.`,
        meta: { 
          summary_request: true,
          url_analysis_result: result, // 서버에서 LLM 프롬프트 생성에 사용 가능하도록 전체 결과 전달
        } 
      });

      if (chatResponse.reply) {
        setSummaryAnalysis(chatResponse.reply); // 챗봇 응답 저장
      }

    } catch (error) {
      console.error("Summary analysis chat error:", error);
      setSummaryAnalysis("분석 요약을 가져오는 중 오류가 발생했습니다.");
    }
  }, []);

  const toggleSummary = () => {
    setShowSummary(prev => !prev);
  };

  const analyzeUrl = useCallback(async (url: string) => {
    if (!url || !url.startsWith('http')) {
        setIsSafe(false);
        setAnalysisResult(null);
        return;
    }
    
    setLoading(true);
    try {
      // POST 요청: analyze.py의 @analyze_bp.route
      const response = await apiClient.post('/analyze', { url });
      const result = response.data;

      // analyze.py 응답의 result 필드를 확인
      const isUrlSafe = result.result === "LEGITIMATE";
      
      setIsSafe(isUrlSafe); // 안전/위험 상태 업데이트
      setAnalysisResult(result); // 전체 분석 결과 저장

      if (result.result === "MALICIOUS") {
        requestSummaryAnalysis(url, result);
      } else {
        setSummaryAnalysis(null);
      }
      
      // (비회원 5개 제한)
      if (result.popup) {
        Alert.alert("알림", result.message);
      }

    } catch (error: any) {
      console.error("URL 분석 오류:", error);
      // 서버 통신 실패 시 기본적으로 안전하지 않다고 가정하거나 오류 메시지 표시
      setIsSafe(false); 
      setAnalysisResult({ message: "분석 서버 오류" });
      Alert.alert("오류", "URL 분석 중 서버 오류가 발생했습니다.");
    } finally {
      setLoading(false);
      setShowActionsMenu(false); // 메뉴 닫기
    }
  }, []);

  useEffect(() => {
    if (scannedCode) {
      analyzeUrl(scannedCode);
    }
  }, [scannedCode, analyzeUrl]);

  useEffect(() => {
    (async () => {
      const status = await Camera.requestCameraPermission();
      setHasPermission(status === "granted");
    })();
  }, []);

  // 모드 변경 시 상태 초기화
  useEffect(() => {
    resetState();
  }, [mode, resetState]);

  const handleClose = () => {
    navigation.goBack();
  };

  const codeScanner = useCodeScanner({
    codeTypes: ["qr"],
    onCodeScanned: (codes) => {
      if (mode != "QR") return;
      if (codes.length > 0) {
        const value = codes[0].value;
        if (value) {
          setScannedCode(value);
        }
      }
    },
  });

  // OCR 인식
  const handleOCRScan = useCallback(async () => {
    if (!camera.current) return;
    setLoading(true);
    try {
      const photo = await camera.current.takePhoto();
      const imageUri = `file://${photo.path}`;
      const result = await TextRecognition.recognize(imageUri);
      const urls = result.text
        .split(/\s+/)
        .filter((t) => /^https?:\/\/[^\s]+$/.test(t));

      if (urls.length > 0) {
        setScannedCode(urls[0]);
      } else {
        setScannedCode("URL을 찾을 수 없습니다.");
        setIsSafe(false);
        setAnalysisResult(null);
      }
    } catch (e) {
      console.error(e);
      setScannedCode("스캔 중 오류가 발생했습니다.");
      setIsSafe(false);
      setAnalysisResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePreview = () => {
    if (!isSafe) {
      setShowActionsMenu(false);
      return;
    }
    if (scannedCode && scannedCode.startsWith('http')) {
      // navigation.navigate('WebView', { url: scannedCode });
      setShowWebView(true);
    } else if (scannedCode) {
      Alert.alert("미리보기 불가", "올바른 URL이 아닙니다.");
      setShowActionsMenu(false);
    }
  };
  const toggleActionsMenu = () => {
    if (!scannedCode || !isSafe) return;
    setShowActionsMenu(prev => !prev);
  };
  const handleShare = async () => {
    if (!scannedCode) return;
    try {
      await Share.share({ message: scannedCode });
    } catch (error: any) {
      Alert.alert("공유 실패", error.message);
    }
    setShowActionsMenu(false);
  };
  const handleCopy = () => {
    if (!scannedCode) return;
    Clipboard.setString(scannedCode);
    Alert.alert("복사 완료", "스캔된 URL이 클립보드에 복사되었습니다.");
    setShowActionsMenu(false);
  };

  const handleOpenLink = () => {
    if (scannedCode && scannedCode.startsWith('http')) {
      if (isSafe) {
        Linking.openURL(scannedCode);
      }
    }
    setShowActionsMenu(false);
  };
  const handleDomainPress = () => {
    if (scannedCode?.startsWith('http')) {
      // Linking.openURL(scannedCode);
      handleOpenLink();
    }
    // setShowActionsMenu(false);
  };

  if (!device) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: "#000" }]}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>카메라 로딩중...</Text>
      </View>
    );
  }

  // if (!hasPermission) {
  //   return (
  //     <View style={[styles.loadingContainer, { backgroundColor: "#000"}]}>
  //       <Text style={styles.loadingText}>카메라 권한이 필요합니다.</Text>
  //       <TouchableOpacity style={styles.linkButton} onPress={Linking.openSettings}>
  //         <Text style={styles.linkText}>설정 열기</Text>
  //       </TouchableOpacity>
  //     </View>
  //   );
  // }
  const isScannedUrl = scannedCode && scannedCode.startsWith('http');
  const displayDomain = isScannedUrl ? extractDomain(scannedCode) : "내용 없음";

  const formatConfidence = (confidence: number | undefined): string => {
    if (confidence === undefined || confidence === null) return '';
    return ` (${Math.round(confidence * 100)}%)`;
  };

  const statusMessage = loading
  ? "분석 중..."
  : analysisResult?.result === "LEGITIMATE"
    ? `안전${formatConfidence(analysisResult.confidence)}`
    : analysisResult?.result === "MALICIOUS"
      ? `위험${formatConfidence(analysisResult.confidence)}`
      : analysisResult?.result === "FAILED"
        ? ""
        : isScannedUrl
          ? ""
          : "";

  const displayScannedCode = isScannedUrl 
    ? scannedCode.length > 35 
      ? scannedCode.substring(0, 30) + "..." 
      : scannedCode 
    : scannedCode || "";

  const scanBoxBorderColor = scannedCode ? "#ffcc00" : "fff";

  return (
    <View style={styles.container}>
      {/* 카메라 화면 */}
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        codeScanner={mode === "QR" ? codeScanner : undefined}
        photo={mode === "URL"}
      />
      <SafeAreaView style={StyleSheet.absoluteFill}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Icon name="close" size={30} color="#fff" />
          </TouchableOpacity>
          <View style={styles.header}>
            <Text style={styles.headerText}>
              {mode === "QR" ? "QR 스캔" : "URL 인식"}
            </Text>
          </View>
        </View>
        {scannedCode && statusMessage !== "" && (
          <View style={styles.safeBoxWrapper}>
            <View style={
              loading 
                ? styles.loadingBox 
                : (isSafe ? styles.safeBox : styles.unsafeBox)
            }>
              <Icon 
                name={loading ? "autorenew" : (isSafe ? "check-circle" : "dangerous")} 
                size={22} 
                color={loading ? "#fff" : (isSafe ? "#33cc33" : "#ff2147")} 
                style={loading && { transform: [{ rotate: '45deg' }]}} // 로딩 아이콘
              />
              <Text style={
                loading 
                  ? styles.loadingText
                  : (isSafe ? styles.safeText : styles.unsafeText)
              }>
                {statusMessage}
              </Text>
            </View>
          </View>
        )}
        {mode === "QR" && (<View style={[styles.scanBox, {borderColor: scanBoxBorderColor}]} />)}
        {/* 스캔 결과 표시 */}
        {scannedCode && !isSafe && summaryAnalysis && showSummary && (
          <View style={styles.floatingSummaryBoxWrapper}>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryTitle}>⚠️ 위험 요약 분석</Text>
              <Text style={styles.summaryText}>{summaryAnalysis}</Text>
            </View>
          </View>
        )}
        {scannedCode && (
          <View style={styles.resultActionsArea}>
            {isSafe && showActionsMenu && (
              <View style={styles.actionsMenu}>
                <View style={styles.actionUrlHeader}>
                  <Text style={styles.actionUrlText} numberOfLines={1}>{displayScannedCode}</Text>
                </View>
                <TouchableOpacity style={styles.actionItem} onPress={handleShare}>
                  <Icon name="share" size={20} color="#fff" />
                  <Text style={styles.actionText}>공유</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionItem} onPress={handleCopy}>
                  <Icon name="content-copy" size={20} color="#fff" />
                  <Text style={styles.actionText}>링크 복사</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionItem} onPress={handleOpenLink}>
                  <Icon name="open-in-new" size={20} color="#fff" />
                  <Text style={styles.actionText}>링크 열기</Text>
                </TouchableOpacity>
              </View>
            )}
            {isScannedUrl ? (
              <View style={styles.bottomActions}>
                {!isSafe && summaryAnalysis ? (
                  <TouchableOpacity 
                    style={[styles.previewButton, { flex: 1, backgroundColor: '#ff2147cc' }]} 
                    onPress={toggleSummary}
                  >
                    <Icon 
                      name={showSummary ? "keyboard-arrow-up" : "bug-report"} 
                      size={20} 
                      color="#fff"
                    />
                    <Text style={styles.previewText}>
                      {showSummary ? "분석 닫기" : "요약 분석 보기"}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  isSafe && (
                    <TouchableOpacity style={styles.previewButton} onPress={handlePreview}>
                      <Text style={styles.previewText}>미리보기</Text>
                    </TouchableOpacity>
                  )
                )}
                {/* {isSafe && (
                  <TouchableOpacity style={styles.previewButton} onPress={handlePreview}>
                    <Text style={styles.previewText}>미리보기</Text>
                  </TouchableOpacity>
                )} */}
                <TouchableOpacity
                  style={styles.domainButton}
                  onPress={handleDomainPress}
                  disabled={!isScannedUrl || loading}
                >
                  <Text style={styles.domainText}>{displayDomain}</Text>
                </TouchableOpacity>

                {isSafe && (
                  <TouchableOpacity onPress={toggleActionsMenu} style={styles.scanIcon}>
                      <Icon name={showActionsMenu ? "close" : "document-scanner"} size={22} color="#ffffffd0"/>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <Text style={styles.warningText}>
                  {scannedCode}
              </Text>
            )}
          </View>
        )}

        {/* 하단 모드 전환 버튼 */}
        <View style={styles.bottomBar}>
          <TouchableOpacity onPress={() => setMode("QR")}>
            <Text
              style={[styles.modeText, mode === "QR" && styles.activeModeText]}
            >
              QR
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMode("URL")}>
            <Text
              style={[styles.modeText, mode === "URL" && styles.activeModeText]}
            >
              URL
            </Text>
          </TouchableOpacity>
        </View>
        {/* OCR 스캔 버튼 */}
        {mode === "URL" && (
          <TouchableOpacity
            style={styles.captureButton}
            onPress={handleOCRScan}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <View style={styles.captureIconInner}></View>
            )}
          </TouchableOpacity>
        )}
        {showWebView && scannedCode && (
          <WebViewCard
            url={scannedCode}
            onClose={() => setShowWebView(false)}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  topBar: {
    position: "absolute",
    top: 0,
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    paddingTop: 10,
    zIndex: 10,
    backgroundColor:'rgb(0,0,0,0.5)',
    paddingVertical: 100,
  },
  closeButton: {
    position: "absolute",
    left: 20,
    top: 10,
    padding: 5,
    zIndex: 5,
  },
  header: { position: "absolute", top: 60, alignSelf: "center" },
  headerText: { fontSize: 22, color: "#fff", fontWeight: "600" },
  scanBox: {
    position: "absolute",
    top: (SCREEN_HEIGHT / 2) - (SCAN_BOX_SIZE / 2),
    left: (SCREEN_WIDTH / 2) - (SCAN_BOX_SIZE / 2),
    width: SCAN_BOX_SIZE,
    height: SCAN_BOX_SIZE,
    borderWidth: 3,
    borderColor: "#fff",
    borderRadius: 16,
    opacity: 0.7,
    zIndex: 3,
  },
  safeBoxWrapper: {
    position: 'absolute',
    top: 150,
    width: '100%',
    alignItems: 'center',
    zIndex: 4,
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: "#333",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  loadingText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 5,
  },
  resultActionsArea: {
    position: 'absolute',
    // top: SCAN_BOX_TOP + SCAN_BOX_SIZE + 20,
    top: SCAN_BOX_TOP + SCAN_BOX_SIZE,
    width: '100%',
    alignItems: 'center',
    zIndex: 5,
  },
  resultContainer: {alignItems: "center", paddingTop: 150, },
  safeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: "#333",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  safeText: {
    color: "#00ff66",
    fontSize: 20,
    fontWeight: "bold",
    marginLeft: 5,
  },
  unsafeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: "#333",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 20,

  },
  unsafeText: {
    color: '#ff0000',
    fontSize: 20,
    fontWeight: "bold",
    marginLeft: 5,
  },
  warningText: {
    color: '#ffcc00',
    marginTop: 5,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: "500",
    paddingHorizontal: 5,
    borderRadius: 8,
    paddingVertical: 10,
  },
  bottomActions: {
    flexDirection: 'row',
    width: '90%',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 0,
  },
  previewButton: {
    flex: 0.7,
    backgroundColor: 'rgba(50,50,50,0.8)',
    borderRadius: 24,
    paddingVertical: 10,
    marginRight: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  previewText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
    marginLeft: 5,
  },
  domainButton: {
    flex: 1,
    backgroundColor: "#ffcc00",
    borderRadius: 24,
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginRight: 10,
  },
  domainText: {
    color: "#000",
    fontWeight: "600",
    fontSize: 16,
  },
  scanIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionsMenu: {
    position: 'absolute',
    left: '20%',
    bottom: 70,
    backgroundColor: '#333',
    borderRadius: 8,
    zIndex: 10,
    width: 300,
    overflow: 'hidden',
  },
  actionUrlHeader: {
    backgroundColor: '#333',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#555',
  },
  actionUrlText: {
    color: '#fff',
    fontSize: 14,
  },
  actionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#555',
  },
  actionText: {
    color: '#fff',
    marginLeft: 16,
    fontWeight: '500',
  },
  linkText: {
    color: "#000",
    fontWeight: "600",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: "row",
    justifyContent: "space-evenly",
    paddingVertical: 40,
  },
  modeText: { color: "#bbb", fontSize: 24, fontWeight: "500" },
  activeModeText: { color: "#ffcc00", fontWeight: "700" },
  captureButton: {
    position: "absolute",
    bottom: 120,
    alignSelf: "center",
    backgroundColor: "transparent",
    borderRadius: 45,
    width: 80,
    height: 80,
    borderWidth: 4,
    borderColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    padding: 0,
  },
  captureIconInner: {
    width: 70,
    height: 70,
    borderRadius: 40,
    backgroundColor: "#fff",
  },
  captureText: { color: "#fff", fontSize: 18 },
    floatingSummaryBoxWrapper: {
    position: 'absolute',
    top: SCAN_BOX_TOP + SCAN_BOX_SIZE - 150,
    width: '100%',
    alignItems: 'center',
    zIndex: 6, // 다른 요소 위에 표시
  },
  summaryBox: {
    // position: 'absolute', 
    // top: 0,
    backgroundColor: 'rgba(50, 0, 0, 0.8)',
    borderWidth: 1,
    borderColor: '#ff2147',
    borderRadius: 10,
    padding: 15,
    // marginBottom: 20,
    width: '90%',
    zIndex: 6,
  },
  summaryTitle: {
    color: '#ffcc00',
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 5,
  },
  summaryText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  }
});
