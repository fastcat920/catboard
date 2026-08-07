package main

import "testing"

func TestSignatureIsStableAndBodySensitive(t *testing.T) {
	a := sign("secret", "POST", "/api/v1/security/probe/results", "100", "0123456789abcdef", []byte(`{"results":[]}`))
	b := sign("secret", "post", "/api/v1/security/probe/results", "100", "0123456789abcdef", []byte(`{"results":[]}`))
	c := sign("secret", "POST", "/api/v1/security/probe/results", "100", "0123456789abcdef", []byte(`{"results":[1]}`))
	if a != b {
		t.Fatal("method canonicalization changed the signature")
	}
	if a == c {
		t.Fatal("signature must cover the request body")
	}
}

func TestClassifyNetworkErrors(t *testing.T) {
	if got := classify(fakeTimeout{}); got != "timeout" {
		t.Fatalf("got %s", got)
	}
}

func TestProtocolTaskRejectsMissingConfiguration(t *testing.T) {
	result := check(taskWire{CheckType: "protocol", ServerType: "v2node", ServerID: 7})
	if result.Success || result.CheckType != "protocol" {
		t.Fatalf("unexpected result: %#v", result)
	}
	if result.ErrorStage != "configuration" || result.ErrorCode != "missing_config" {
		t.Fatalf("unexpected layered error: %s/%s", result.ErrorStage, result.ErrorCode)
	}
}

type fakeTimeout struct{}

func (fakeTimeout) Error() string   { return "timeout" }
func (fakeTimeout) Timeout() bool   { return true }
func (fakeTimeout) Temporary() bool { return true }
