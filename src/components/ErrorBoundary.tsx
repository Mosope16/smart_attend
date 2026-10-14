import React, { Component, ReactNode, ErrorInfo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
} from 'react-native';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react-native';
import { observability } from '../lib/observability';
import { router } from 'expo-router';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

const ff = Platform.OS === 'android';

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    // Record error in enterprise observability suite
    observability.captureException(error, {
      componentStack: errorInfo.componentStack,
      source: 'ErrorBoundary',
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
  };

  handleGoHome = () => {
    this.handleReset();
    try {
      router.replace('/');
    } catch {
      // Fallback
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.root}>
          <View style={styles.content}>
            <View style={styles.iconCircle}>
              <AlertTriangle size={36} color="#DC2626" />
            </View>

            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.subtitle}>
              An unexpected error occurred. The automated diagnostics system has recorded this event to ensure prompt resolution.
            </Text>

            <View style={styles.buttonRow}>
              <Pressable
                onPress={this.handleReset}
                style={[styles.btn, styles.btnPrimary]}
              >
                <RefreshCw size={16} color="#FFFFFF" />
                <Text style={styles.btnPrimaryText}>Try Again</Text>
              </Pressable>

              <Pressable
                onPress={this.handleGoHome}
                style={[styles.btn, styles.btnSecondary]}
              >
                <Home size={16} color="#1B6B3A" />
                <Text style={styles.btnSecondaryText}>Go Home</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
              style={styles.detailsToggle}
            >
              <Text style={styles.detailsToggleText}>
                {this.state.showDetails ? 'Hide Diagnostic Details' : 'Show Diagnostic Details'}
              </Text>
            </Pressable>

            {this.state.showDetails && (
              <ScrollView style={styles.detailsBox} showsVerticalScrollIndicator={false}>
                <Text style={styles.errorName}>
                  {this.state.error?.name}: {this.state.error?.message}
                </Text>
                {this.state.error?.stack && (
                  <Text style={styles.stackTrace}>{this.state.error.stack}</Text>
                )}
                {this.state.errorInfo?.componentStack && (
                  <Text style={styles.componentStack}>
                    {this.state.errorInfo.componentStack}
                  </Text>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A1E14',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#0D2B1D',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: ff ? 'sans-serif-medium' : undefined,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
    fontFamily: ff ? 'sans-serif' : undefined,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: 16,
  },
  btn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnPrimary: {
    backgroundColor: '#1B6B3A',
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
    fontFamily: ff ? 'sans-serif-medium' : undefined,
  },
  btnSecondary: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  btnSecondaryText: {
    color: '#0A1E14',
    fontWeight: '700',
    fontSize: 14,
    fontFamily: ff ? 'sans-serif-medium' : undefined,
  },
  detailsToggle: {
    paddingVertical: 6,
  },
  detailsToggleText: {
    fontSize: 12,
    color: '#4ADE80',
    fontWeight: '600',
  },
  detailsBox: {
    width: '100%',
    maxHeight: 180,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  errorName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F87171',
    marginBottom: 6,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  stackTrace: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  componentStack: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: 6,
    lineHeight: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});
