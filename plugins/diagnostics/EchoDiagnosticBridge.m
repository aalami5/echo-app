#import <React/RCTBridgeModule.h>
@interface RCT_EXTERN_MODULE(EchoDiagnosticBridge, NSObject)
RCT_EXTERN_METHOD(mark:(NSString *)phase)
@end
