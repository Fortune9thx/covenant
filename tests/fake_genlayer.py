"""A minimal in-process stand-in for the GenVM runtime.

Enough of `genlayer` to import Covenant.py and drive its state machine under
CPython: storage maps, the contract decorators, value transfer, the equivalence
principle, and a non-determinism layer whose model answers and web fetches the
test supplies.

This is a harness, not an emulator. It deliberately reproduces the runtime
behaviours COVENANT's safety rests on and nothing more:

  * `strict_eq` runs the judgment function on the leader and again,
    independently, on the validator, and raises when the two disagree — so a
    consensus failure is exercised rather than assumed.
  * `web.render` is called once per side, so evidence is re-fetched by each
    side rather than shared.
  * a web entry may be a queue of responses, consumed one per call, which is
    how a test makes the leader and the validator see different evidence.

Do not add a name here without confirming it exists in the real SDK: an earlier
harness on this stack invented `genlayer.types.TreeMap`, `gl.evm.send_value`
and `gl.block.timestamp`, none of which the VM has, so the whole suite passed
against a deployable the VM could not import.
"""

import sys
import types
from typing import ClassVar


class UserError(Exception):
    pass


# --- storage primitives ----------------------------------------------------


class TreeMap(dict):
    """Ordered-by-insertion mapping; the contract only needs get/set/contains."""


def u256(v):
    v = int(v)
    if v < 0:
        raise UserError("u256 underflow")
    return v


class Address:
    def __init__(self, hexstr):
        if not isinstance(hexstr, str) or not hexstr:
            raise UserError("bad address")
        self._hex = hexstr.lower()

    @property
    def as_hex(self):
        return self._hex

    def __eq__(self, other):
        return isinstance(other, Address) and other._hex == self._hex

    def __hash__(self):
        return hash(self._hex)

    def __repr__(self):
        return f"Address({self._hex})"


# --- ambient chain state ---------------------------------------------------


class _Message:
    sender_address = Address("0x" + "11" * 20)
    value = 0
    # Sentinel, live on this exact pin, reads the time from here: gl.block does
    # not exist and gl.vm.get_timestamp() raises on chain. `.datetime` is the
    # CORD-era spelling; both are provided so either read works.
    datetime = "2023-11-14T22:13:20+00:00"
    raw: ClassVar[dict] = {"datetime": "2023-11-14T22:13:20+00:00"}


class _Chain:
    """Records value sent out, so tests can assert on payouts."""

    def __init__(self):
        self.sent = []

    def emit_transfer_from(self, to, amount):
        self.sent.append((to.as_hex, int(amount)))


# --- non-determinism -------------------------------------------------------


class NondetControl:
    """Scripted model answers and web responses."""

    def __init__(self):
        self.leader_answers = []
        self.validator_answers = []
        self.web = {}
        self.prompts = []
        self.fetched = []
        self.force_exception = False

    def reset(self):
        self.__init__()


class _Web:
    def __init__(self, control):
        self._c = control

    def _serve(self, url):
        self._c.fetched.append(url)
        entry = self._c.web.get(url)
        if entry is None:
            raise RuntimeError("fetch failed: " + url)
        if isinstance(entry, list):
            if not entry:
                raise RuntimeError("fetch exhausted: " + url)
            entry = entry.pop(0)
        status, body = entry
        return status, body if isinstance(body, bytes) else str(body).encode("utf-8")

    def get(self, url):
        status, body = self._serve(url)
        return types.SimpleNamespace(status=status, body=body)

    def render(self, url, mode="text"):
        status, body = self._serve(url)
        if status != 200:
            raise RuntimeError(f"http {status}: {url}")
        return body.decode("utf-8", "replace")


def _make_modules():
    control = NondetControl()
    chain = _Chain()

    gl = types.ModuleType("genlayer")

    # contract.Contract
    contract_mod = types.ModuleType("genlayer.contract")

    class Contract:
        """Allocates annotated storage fields, as GenVM does for a deployed IC."""

        def __new__(cls, *args, **kwargs):
            obj = super().__new__(cls)
            for klass in reversed(cls.__mro__):
                for name, ann in getattr(klass, "__annotations__", {}).items():
                    origin = getattr(ann, "__origin__", ann)
                    if origin is TreeMap or ann is TreeMap:
                        setattr(obj, name, TreeMap())
                    elif ann is u256:
                        setattr(obj, name, 0)
            return obj

    contract_mod.Contract = Contract

    def _mark(kind):
        def deco(fn):
            fn.__covenant_kind__ = kind
            return fn

        return deco

    class _Write:
        def __call__(self, fn):
            return _mark("write")(fn)

        @property
        def payable(self):
            return _mark("write.payable")

    public = types.SimpleNamespace(write=_Write(), view=_mark("view"))

    # vm
    vm_mod = types.ModuleType("genlayer.vm")
    vm_mod.UserError = UserError

    # eq_principle
    eq_mod = types.ModuleType("genlayer.eq_principle")

    def strict_eq(fn):
        if control.force_exception:
            raise RuntimeError("nondet unavailable")
        leader_result = fn()
        validator_result = fn()
        if leader_result != validator_result:
            raise RuntimeError("validators did not reach consensus")
        return leader_result

    eq_mod.strict_eq = strict_eq

    # nondet
    nondet_mod = types.ModuleType("genlayer.nondet")
    nondet_mod.web = _Web(control)

    def exec_prompt(prompt, response_format=None):
        control.prompts.append(prompt)
        if not control._leader_served:
            control._leader_served = True
            served = control.leader_answers.pop(0) if control.leader_answers else "{}"
            control.last_leader_answer = served
            return served
        control._leader_served = False
        if control.validator_answers:
            return control.validator_answers.pop(0)
        return control.last_leader_answer

    control._leader_served = False
    control.last_leader_answer = "{}"
    nondet_mod.exec_prompt = exec_prompt

    # evm.contract_interface — used to pay a wallet, per the live SDK.
    evm_mod = types.ModuleType("genlayer.evm")

    def contract_interface(_cls):
        class _Interface:
            def __init__(self, address):
                self.address = address

            def emit_transfer(self, value, on="finalized", **kwargs):
                chain.emit_transfer_from(self.address, value)

        return _Interface

    evm_mod.contract_interface = contract_interface

    # types / storage — verified shapes, TreeMap lives in storage not types.
    types_mod = types.ModuleType("genlayer.types")
    types_mod.Address = Address
    types_mod.u256 = u256
    types_mod.u8 = int
    types_mod.u32 = int
    types_mod.bigint = int
    types_mod.__all__ = ["Address", "u256", "u8", "u32", "bigint"]

    storage_mod = types.ModuleType("genlayer.storage")
    storage_mod.TreeMap = TreeMap
    storage_mod.__all__ = ["TreeMap"]

    gl.contract = contract_mod
    gl.public = public
    gl.vm = vm_mod
    gl.eq_principle = eq_mod
    gl.nondet = nondet_mod
    gl.evm = evm_mod
    gl.types = types_mod
    gl.storage = storage_mod
    gl.message = _Message

    return (
        gl,
        types_mod,
        storage_mod,
        contract_mod,
        vm_mod,
        nondet_mod,
        evm_mod,
        eq_mod,
        control,
        chain,
    )


def install():
    """Register the fake modules in sys.modules and return the test controls."""
    (
        gl,
        types_mod,
        storage_mod,
        contract_mod,
        vm_mod,
        nondet_mod,
        evm_mod,
        eq_mod,
        control,
        chain,
    ) = _make_modules()
    sys.modules["genlayer"] = gl
    sys.modules["genlayer.types"] = types_mod
    sys.modules["genlayer.storage"] = storage_mod
    sys.modules["genlayer.contract"] = contract_mod
    sys.modules["genlayer.vm"] = vm_mod
    sys.modules["genlayer.nondet"] = nondet_mod
    sys.modules["genlayer.evm"] = evm_mod
    sys.modules["genlayer.eq_principle"] = eq_mod
    return gl, control, chain
