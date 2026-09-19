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

type fakeTimeout struct{}

func (fakeTimeout) Error() string   { return "timeout" }
func (fakeTimeout) Timeout() bool   { return true }
func (fakeTimeout) Temporary() bool { return true }
